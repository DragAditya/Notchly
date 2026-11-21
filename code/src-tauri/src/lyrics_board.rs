//! Floating lyrics board: a small always-on-top window that morphs out of the
//! notch, lives in the bottom-right corner and morphs back when closed.
//!
//! The window is created on a worker thread (building a webview from a sync
//! command deadlocks on Windows, see `settings.rs`). Both directions animate
//! the window's real bounds so the move is part of the morph, not a cut. The
//! frontend page is `src/lyrics/LyricsApp.tsx`.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::window::ISLAND_LABEL;

pub const LABEL: &str = "lyrics";
pub const CHANGED_EVENT: &str = "lyrics://changed";
pub const CLOSING_EVENT: &str = "lyrics://closing";
pub const CLOSED_EVENT: &str = "lyrics://closed";

const X_KEY: &str = "lyrics.x";
const Y_KEY: &str = "lyrics.y";
const WIDTH_KEY: &str = "lyrics.width";
const HEIGHT_KEY: &str = "lyrics.height";
const DEFAULT_W: f64 = 460.0;
const DEFAULT_H: f64 = 380.0;
const MIN_W: f64 = 180.0;
const MIN_H: f64 = 60.0;
const MARGIN: f64 = 16.0;
const OPEN_MS: u64 = 420;
const CLOSE_MS: u64 = 360;

/// Notch rect in CSS px, measured by the frontend when the face is clicked.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Origin {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Rect {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

#[derive(Default)]
pub struct BoardState {
    /// Where the notch was when the board opened (physical px).
    origin: Mutex<Option<Rect>>,
    /// Bumped on every morph; stale animation loops bail out.
    epoch: AtomicU64,
    open: AtomicBool,
    animating: AtomicBool,
    /// Resting at its destination: only then may the bounds be persisted.
    settled: AtomicBool,
    creating: AtomicBool,
}

impl BoardState {
    fn next_gen(&self) -> u64 {
        self.epoch.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn generation(&self) -> u64 {
        self.epoch.load(Ordering::Relaxed)
    }

    fn set_origin(&self, r: Rect) {
        *self.origin.lock().unwrap() = Some(r);
    }

    fn origin(&self) -> Option<Rect> {
        *self.origin.lock().unwrap()
    }
}

fn setting(app: &AppHandle, key: &str) -> Option<f64> {
    app.state::<crate::settings::Settings>().get(key)?.as_f64()
}

fn size(app: &AppHandle) -> (f64, f64) {
    (
        setting(app, WIDTH_KEY)
            .unwrap_or(DEFAULT_W)
            .clamp(MIN_W, 2048.0),
        setting(app, HEIGHT_KEY)
            .unwrap_or(DEFAULT_H)
            .clamp(MIN_H, 2048.0),
    )
}

fn save_bounds(app: &AppHandle, x: f64, y: f64, w: f64, h: f64) {
    crate::settings::set(app, X_KEY, json!(x.round()));
    crate::settings::set(app, Y_KEY, json!(y.round()));
    crate::settings::set(app, WIDTH_KEY, json!(w.round()));
    crate::settings::set(app, HEIGHT_KEY, json!(h.round()));
}

fn island_of(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(ISLAND_LABEL)
}

fn show_island(app: &AppHandle) {
    if let Some(win) = island_of(app) {
        let _ = win.show();
    }
}

#[tauri::command]
pub fn is_lyrics_open(app: AppHandle) -> bool {
    app.state::<BoardState>().open.load(Ordering::Relaxed)
}

/// Open (or focus) the board. `origin` is the face rect in island CSS pixels.
#[tauri::command]
pub fn open_lyrics(app: AppHandle, origin: Origin) -> Result<(), String> {
    let state = app.state::<BoardState>();
    let was_open = state.open.swap(true, Ordering::Relaxed);
    if let Some(win) = app.get_webview_window(LABEL) {
        // Already resting on screen: just take focus back.
        let settled =
            was_open && state.settled.load(Ordering::Relaxed) && win.is_visible().unwrap_or(false);
        if settled {
            let _ = win.set_focus();
            let _ = app.emit(CHANGED_EVENT, true);
            return Ok(());
        }
        // Hidden after a close, or still flying: morph out of the notch again.
        let app2 = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = begin(&app2, &win, origin) {
                log::error!("lyrics window: {e}");
                reopen_failed(&app2);
            }
        });
        return Ok(());
    }
    if state.creating.swap(true, Ordering::Relaxed) {
        return Ok(());
    }
    let app2 = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = create(&app2, origin) {
            log::error!("lyrics window: {e}");
            app2.state::<BoardState>()
                .creating
                .store(false, Ordering::Relaxed);
            reopen_failed(&app2);
        }
    });
    Ok(())
}

/// Opening failed: put the notch back instead of leaving an invisible strip.
fn reopen_failed(app: &AppHandle) {
    app.state::<BoardState>()
        .open
        .store(false, Ordering::Relaxed);
    show_island(app);
    let _ = app.emit(CHANGED_EVENT, false);
}

/// Morph the board back into the notch and restore the island.
#[tauri::command]
pub fn close_lyrics(app: AppHandle) {
    close(&app);
}

fn close(app: &AppHandle) {
    let state = app.state::<BoardState>();
    if !state.open.swap(false, Ordering::Relaxed) {
        show_island(app);
        let _ = app.emit(CHANGED_EVENT, false);
        return;
    }
    let epoch = state.next_gen();
    state.settled.store(false, Ordering::Relaxed);
    let Some(win) = app.get_webview_window(LABEL) else {
        show_island(app);
        let _ = app.emit(CLOSED_EVENT, ());
        return;
    };
    let current = bounds(&win);
    let target = state.origin().unwrap_or(current);
    let _ = app.emit(CLOSING_EVENT, true);

    let app2 = app.clone();
    std::thread::spawn(move || {
        state_animating(&app2, true);
        animate(&app2, &win, current, target, CLOSE_MS, epoch);
        state_animating(&app2, false);
        if app2.state::<BoardState>().generation() != epoch {
            return; // reopened while we were flying back
        }
        let _ = win.hide();
        show_island(&app2);
        let _ = app2.emit(CHANGED_EVENT, false);
        let _ = app2.emit(CLOSED_EVENT, ());
    });
}

fn state_animating(app: &AppHandle, on: bool) {
    app.state::<BoardState>()
        .animating
        .store(on, Ordering::Relaxed);
}

fn bounds(win: &WebviewWindow) -> Rect {
    let pos = win
        .outer_position()
        .unwrap_or_else(|_| PhysicalPosition::new(0, 0));
    let size = win.outer_size().unwrap_or_else(|_| PhysicalSize::new(1, 1));
    Rect {
        x: pos.x,
        y: pos.y,
        w: size.width.max(1),
        h: size.height.max(1),
    }
}

/// Ease position and size together. `epoch` cancels a loop when a new morph starts.
fn animate(app: &AppHandle, win: &WebviewWindow, from: Rect, to: Rect, ms: u64, epoch: u64) {
    let start = Instant::now();
    let mut last = from;
    loop {
        if app.state::<BoardState>().generation() != epoch {
            return;
        }
        let t = (start.elapsed().as_millis() as f64 / ms as f64).min(1.0);
        let e = 1.0 - (1.0 - t).powi(3);
        let lerp = |a: i32, b: i32| (a as f64 + (b as f64 - a as f64) * e).round() as i32;
        let rect = Rect {
            x: lerp(from.x, to.x),
            y: lerp(from.y, to.y),
            w: lerp(from.w as i32, to.w as i32).max(1) as u32,
            h: lerp(from.h as i32, to.h as i32).max(1) as u32,
        };
        if rect.x != last.x || rect.y != last.y {
            let _ = win.set_position(PhysicalPosition::new(rect.x, rect.y));
        }
        if rect.w != last.w || rect.h != last.h {
            let _ = win.set_size(PhysicalSize::new(rect.w, rect.h));
        }
        last = rect;
        if t >= 1.0 {
            break;
        }
        std::thread::sleep(Duration::from_millis(12));
    }
}

fn island_frame(app: &AppHandle) -> (PhysicalPosition<i32>, f64) {
    match island_of(app) {
        Some(win) => (
            win.outer_position()
                .unwrap_or_else(|_| PhysicalPosition::new(0, 0)),
            win.scale_factor().unwrap_or(1.0),
        ),
        None => (PhysicalPosition::new(0, 0), 1.0),
    }
}

/// The small rect the board starts from: centred on the face, kept on screen.
fn start_rect(app: &AppHandle, origin: Origin) -> (Rect, f64) {
    let (pos, scale) = island_frame(app);
    let px = |v: f64| (v * scale).round() as i32;
    let start_w = px(origin.width).max((220.0 * scale) as i32);
    let start_h = px(origin.height).max((160.0 * scale) as i32);
    let cx = pos.x + px(origin.x) + px(origin.width) / 2;
    let cy = pos.y + px(origin.y) + px(origin.height) / 2;
    let mut start = Rect {
        x: cx - start_w / 2,
        y: cy - start_h / 2,
        w: start_w as u32,
        h: start_h as u32,
    };
    if let Some(monitor) = island_of(app).and_then(|w| w.current_monitor().ok().flatten()) {
        let area = monitor.work_area();
        start.x = start.x.clamp(
            area.position.x,
            (area.position.x + area.size.width as i32 - start.w as i32).max(area.position.x),
        );
        start.y = start.y.clamp(
            area.position.y,
            (area.position.y + area.size.height as i32 - start.h as i32).max(area.position.y),
        );
    }
    (start, scale)
}

fn hide_island_later(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(140));
        // A very fast close may already have brought the notch back.
        if !app.state::<BoardState>().open.load(Ordering::Relaxed) {
            return;
        }
        if let Some(island) = island_of(&app) {
            let _ = island.hide();
        }
    });
}

/// Shared by the first open and a later reopen: fly the window out of the notch.
fn begin(app: &AppHandle, win: &WebviewWindow, origin: Origin) -> tauri::Result<()> {
    let (start, scale) = start_rect(app, origin);
    let (saved_w, saved_h) = size(app);
    let target = destination(app, scale, saved_w, saved_h);

    let state = app.state::<BoardState>();
    state.set_origin(start);
    state.open.store(true, Ordering::Relaxed);
    let epoch = state.next_gen();
    state.settled.store(false, Ordering::Relaxed);

    let _ = win.set_position(PhysicalPosition::new(start.x, start.y));
    let _ = win.set_size(PhysicalSize::new(start.w, start.h));
    let _ = app.emit(CHANGED_EVENT, true);
    win.show()?;
    let _ = win.set_focus();
    // Reopened while a fullscreen app owns the screen: stay out of its way.
    if crate::window::is_fullscreen_active(app.clone()) {
        let _ = win.hide();
    }
    hide_island_later(app);

    state_animating(app, true);
    animate(app, win, start, target, OPEN_MS, epoch);
    state_animating(app, false);
    let state = app.state::<BoardState>();
    if state.generation() == epoch {
        save_bounds(
            app,
            target.x as f64 / scale,
            target.y as f64 / scale,
            saved_w,
            saved_h,
        );
        state.settled.store(true, Ordering::Relaxed);
    }
    Ok(())
}

fn create(app: &AppHandle, origin: Origin) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Notchly — Lyrics")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .min_inner_size(MIN_W, MIN_H)
        .shadow(false)
        .focused(true)
        .visible(false)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .build()?;

    let handle = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let app = handle.clone();
            std::thread::spawn(move || close(&app));
        }
        WindowEvent::Destroyed => {
            let _ = handle.emit(CHANGED_EVENT, false);
        }
        _ => {}
    });

    let result = begin(app, &win, origin);
    app.state::<BoardState>()
        .creating
        .store(false, Ordering::Relaxed);
    result
}

/// Where the board lands: the saved spot when there is one, otherwise the
/// bottom-right corner of the island's monitor.
fn destination(app: &AppHandle, scale: f64, w: f64, h: f64) -> Rect {
    let monitor = island_of(app)
        .and_then(|win| win.current_monitor().ok().flatten())
        .or_else(|| {
            app.get_webview_window(LABEL)
                .and_then(|w| w.primary_monitor().ok().flatten())
        });
    let Some(monitor) = monitor else {
        return Rect {
            x: 100,
            y: 100,
            w: (w * scale) as u32,
            h: (h * scale) as u32,
        };
    };
    let area = monitor.work_area();
    let m = (MARGIN * scale).round() as i32;
    let pw = (w * scale).round() as i32;
    let ph = (h * scale).round() as i32;
    let (left, top) = (area.position.x, area.position.y);
    let right = (left + area.size.width as i32 - pw).max(left);
    let bottom = (top + area.size.height as i32 - ph).max(top);

    let (x, y) = match (setting(app, X_KEY), setting(app, Y_KEY)) {
        (Some(x), Some(y)) => (
            ((x * scale).round() as i32).clamp(left, right),
            ((y * scale).round() as i32).clamp(top, bottom),
        ),
        _ => (
            (left + area.size.width as i32 - pw - m).max(left),
            (top + area.size.height as i32 - ph - m).max(top),
        ),
    };
    Rect {
        x,
        y,
        w: pw.max(1) as u32,
        h: ph.max(1) as u32,
    }
}

/// Called after a drag or resize settles: remember the bounds, clamped so the
/// board can never end up completely off-screen.
#[tauri::command]
pub fn lyrics_snap(app: AppHandle) -> Result<(), String> {
    let state = app.state::<BoardState>();
    // Never persist the notch-sized frame of a close morph, or a frame of the
    // open morph that is still travelling.
    if !state.open.load(Ordering::Relaxed)
        || state.animating.load(Ordering::Relaxed)
        || !state.settled.load(Ordering::Relaxed)
    {
        return Ok(());
    }

    let win = app.get_webview_window(LABEL).ok_or("no lyrics window")?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let size = win.outer_size().map_err(|e| e.to_string())?;
    let mut x = pos.x as f64 / scale;
    let mut y = pos.y as f64 / scale;
    let w = (size.width as f64 / scale).max(MIN_W);
    let h = (size.height as f64 / scale).max(MIN_H);

    if let Ok(Some(monitor)) = win.current_monitor() {
        let area = monitor.work_area();
        let left = area.position.x as f64 / scale;
        let top = area.position.y as f64 / scale;
        let right = (area.position.x + area.size.width as i32) as f64 / scale;
        let bottom = (area.position.y + area.size.height as i32) as f64 / scale;
        x = x.clamp(left, (right - w).max(left));
        y = y.clamp(top, (bottom - h).max(top));
        if x * scale != pos.x as f64 || y * scale != pos.y as f64 {
            let _ = win.set_position(PhysicalPosition::new(
                (x * scale).round() as i32,
                (y * scale).round() as i32,
            ));
        }
    }
    save_bounds(&app, x, y, w, h);
    Ok(())
}

/// A fullscreen app is in front: keep the board logically open but out of sight.
#[tauri::command]
pub fn lyrics_set_visibility(app: AppHandle, visible: bool) {
    let state = app.state::<BoardState>();
    if !state.open.load(Ordering::Relaxed) {
        return;
    }
    if let Some(win) = app.get_webview_window(LABEL) {
        if visible {
            let _ = win.show();
        } else {
            let _ = win.hide();
        }
    }
}
