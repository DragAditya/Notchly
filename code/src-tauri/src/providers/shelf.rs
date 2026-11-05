//! The island's shelf: files and folders dropped on it, kept by reference
//! (nothing is copied) until you drag them somewhere else or remove them.
//! Persisted in the app data folder as `shelf.json`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::Manager;

use super::Provider;
use super::ask::{data_url, image_media_type};
use crate::hub::Hub;
use crate::settings::Settings;

pub const ID: &str = "shelf";
pub const MAX_ITEMS: usize = 12;
const MAX_THUMB_BYTES: u64 = 4_000_000;
const MAX_ITEMS_KEY: &str = "shelf.maxItems";
const AUTO_CLEAR_KEY: &str = "shelf.autoClearMinutes";
const DROP_BEHAVIOR_KEY: &str = "shelf.dropBehavior";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    path: String,
    name: String,
    is_dir: bool,
    /// Lowercase extension, for the file icon.
    ext: String,
    /// Small pictures: the picture itself, as a data URL.
    thumb: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
struct State {
    items: Vec<Item>,
}

struct Ctx {
    hub: Arc<Hub>,
    file: PathBuf,
    paths: Mutex<Vec<String>>,
    thumbs: Mutex<HashMap<String, Option<String>>>,
    /// Last time something was added, for the auto-clear timer.
    last_add: Mutex<Option<Instant>>,
}

impl Ctx {
    fn setting_usize(&self, key: &str, default: usize) -> usize {
        self.hub
            .app()
            .state::<Settings>()
            .get(key)
            .and_then(|value| value.as_u64())
            .map(|value| value as usize)
            .unwrap_or(default)
    }

    fn setting_string(&self, key: &str, default: &str) -> String {
        self.hub
            .app()
            .state::<Settings>()
            .get(key)
            .and_then(|value| value.as_str().map(str::to_string))
            .unwrap_or_else(|| default.to_string())
    }

    /// Drops entries whose file was deleted or moved, saves and publishes.
    fn commit(&self) {
        let max_items = self.setting_usize(MAX_ITEMS_KEY, MAX_ITEMS).clamp(1, 50);
        let auto_clear = self.setting_usize(AUTO_CLEAR_KEY, 0).min(24 * 60) as u64;
        let expired = {
            let last = self.last_add.lock().unwrap();
            auto_clear > 0
                && last.is_some_and(|at| at.elapsed() >= Duration::from_secs(auto_clear * 60))
        };
        let paths: Vec<String> = {
            let mut paths = self.paths.lock().unwrap();
            if expired {
                paths.clear();
                *self.last_add.lock().unwrap() = None;
            }
            paths.retain(|p| Path::new(p).exists());
            paths.truncate(max_items);
            paths.clone()
        };
        if let Some(dir) = self.file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string(&paths) {
            let _ = std::fs::write(&self.file, text);
        }
        let mut thumbs = self.thumbs.lock().unwrap();
        let items = paths
            .iter()
            .map(|p| {
                let path = Path::new(p);
                let thumb = thumbs
                    .entry(p.clone())
                    .or_insert_with(|| {
                        let small =
                            std::fs::metadata(path).is_ok_and(|m| m.len() <= MAX_THUMB_BYTES);
                        image_media_type(path)
                            .filter(|_| small)
                            .and_then(|m| data_url(path, m))
                    })
                    .clone();
                Item {
                    path: p.clone(),
                    name: path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| p.clone()),
                    is_dir: path.is_dir(),
                    ext: path
                        .extension()
                        .map(|e| e.to_string_lossy().to_lowercase())
                        .unwrap_or_default(),
                    thumb,
                }
            })
            .collect();
        thumbs.retain(|k, _| paths.contains(k));
        drop(thumbs);
        self.hub.publish(ID, &State { items });
    }
}

#[derive(Default)]
pub struct ShelfProvider {
    ctx: Mutex<Option<Arc<Ctx>>>,
}

impl Provider for ShelfProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let file = hub
            .app()
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("shelf.json");
        let paths = std::fs::read_to_string(&file)
            .ok()
            .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
            .unwrap_or_default();
        let last_add = if paths.is_empty() {
            None
        } else {
            Some(Instant::now())
        };
        let ctx = Arc::new(Ctx {
            hub,
            file,
            paths: Mutex::new(paths),
            thumbs: Mutex::default(),
            last_add: Mutex::new(last_add),
        });
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        ctx.commit();
        // Notice files deleted or moved meanwhile.
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_secs(10));
                ctx.commit();
            }
        });
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self
            .ctx
            .lock()
            .unwrap()
            .clone()
            .ok_or("shelf not started")?;
        match action {
            // Newest first; dropping something already there moves it to the front.
            "add" => {
                let new: Vec<String> =
                    serde_json::from_value(payload).map_err(|e| e.to_string())?;
                let behavior = ctx.setting_string(DROP_BEHAVIOR_KEY, "link");
                let dir = ctx
                    .hub
                    .app()
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::env::temp_dir())
                    .join("shelf-files");
                let mut paths = ctx.paths.lock().unwrap();
                for p in new {
                    let p = materialize(Path::new(&p), &dir, &behavior)
                        .to_string_lossy()
                        .to_string();
                    paths.retain(|q| !q.eq_ignore_ascii_case(&p));
                    paths.insert(0, p);
                }
                *ctx.last_add.lock().unwrap() = Some(Instant::now());
            }
            "remove" => {
                let path = payload.as_str().unwrap_or_default();
                ctx.paths.lock().unwrap().retain(|p| p != path);
            }
            "clear" => ctx.paths.lock().unwrap().clear(),
            "open" => {
                if let Some(path) = known(&ctx, &payload) {
                    crate::settings::open_url(&path);
                }
                return Ok(Value::Null);
            }
            // Drag an item out to any app (Explorer, WhatsApp, an e-mail…).
            "drag" => {
                let path = known(&ctx, &payload).ok_or("not on the shelf")?;
                start_drag(ctx.hub.app(), vec![PathBuf::from(path)]);
                return Ok(Value::Null);
            }
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        ctx.commit();
        Ok(Value::Null)
    }
}

/// Link keeps the original path; copy/move materialize the file inside the app
/// data folder so the shelf owns it.
fn materialize(source: &Path, dir: &Path, behavior: &str) -> PathBuf {
    if behavior != "copy" && behavior != "move" {
        return source.to_path_buf();
    }
    if source.starts_with(dir) {
        return source.to_path_buf();
    }
    if std::fs::create_dir_all(dir).is_err() {
        return source.to_path_buf();
    }
    let target = unique_target(dir, source);
    let result = if behavior == "copy" {
        copy_recursive(source, &target)
    } else {
        move_path(source, &target)
    };
    match result {
        Ok(()) => target,
        Err(error) => {
            log::warn!("shelf: could not {behavior} {}: {error}", source.display());
            source.to_path_buf()
        }
    }
}

fn unique_target(dir: &Path, source: &Path) -> PathBuf {
    let name = source
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_else(|| "item".into());
    let mut target = dir.join(&name);
    if !target.exists() {
        return target;
    }
    let stem = source
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_else(|| "item".to_string());
    let ext = source
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy()))
        .unwrap_or_default();
    for index in 2..10_000 {
        target = dir.join(format!("{stem} ({index}){ext}"));
        if !target.exists() {
            break;
        }
    }
    target
}

fn copy_recursive(source: &Path, target: &Path) -> std::io::Result<()> {
    if source.is_dir() {
        std::fs::create_dir_all(target)?;
        for entry in std::fs::read_dir(source)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &target.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(source, target)?;
        Ok(())
    }
}

fn move_path(source: &Path, target: &Path) -> std::io::Result<()> {
    if std::fs::rename(source, target).is_ok() {
        return Ok(());
    }
    copy_recursive(source, target)?;
    if source.is_dir() {
        std::fs::remove_dir_all(source)
    } else {
        std::fs::remove_file(source)
    }
}

/// Only paths that are actually on the shelf can be opened or dragged.
fn known(ctx: &Ctx, payload: &Value) -> Option<String> {
    let path = payload.as_str()?;
    ctx.paths
        .lock()
        .unwrap()
        .iter()
        .find(|p| *p == path)
        .cloned()
}

/// OLE drag & drop has to run on the UI thread, while the mouse button is down.
/// Also used by the clipboard history.
pub(crate) fn start_drag(app: &tauri::AppHandle, paths: Vec<PathBuf>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(win) = handle.get_webview_window(crate::window::ISLAND_LABEL) else {
            return;
        };
        let image = match paths.as_slice() {
            [one] if image_media_type(one).is_some() => drag::Image::File(one.clone()),
            _ => drag::Image::Raw(vec![]),
        };
        if let Err(e) = drag::start_drag(
            &win,
            drag::DragItem::Files(paths),
            image,
            |_, _| {},
            drag::Options::default(),
        ) {
            log::warn!("drag failed: {e}");
        }
    });
}
