//! Clipboard history: whatever you copy (text, pictures, files) shows up in
//! the island for a moment, and the latest ones stay in a list to copy again,
//! drag into another app, keep on the shelf or ask Claude about. Screenshots
//! (Win+Shift+S, Print Screen, ShareX…) open the island with the picture.
//!
//! Privacy: text only lives in memory. Pictures are written to the app data
//! folder (wiped at start) because dragging and attaching need a file. What
//! password managers mark as private is never read, and nothing is read while
//! the module is off.

pub mod image;
mod os;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, UNIX_EPOCH};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;

use self::image::Picture;
use self::os::{Clip, Copied, Payload};
use super::{Provider, now_ms};
use crate::hub::Hub;
use crate::i18n;
use crate::settings::Settings;

pub const ID: &str = "clipboard";
const ENABLED_KEY: &str = "module.clipboard.enabled";
const RETENTION_KEY: &str = "clipboard.retentionMinutes";
const SCREENSHOT_CLEANUP_KEY: &str = "clipboard.screenshotCleanup";
const SCREENSHOT_TTL_KEY: &str = "clipboard.screenshotTtlMinutes";
const DEFAULT_SCREENSHOT_TTL_MINUTES: u64 = 5;
const MAX_SCREENSHOT_TTL_MINUTES: u64 = 7 * 24 * 60;
/// The Snipping Tool can finish writing the PNG a moment after the clipboard
/// changes; retry finding it for this long.
const SCREENSHOT_RESOLVE_MS: u64 = 20_000;
const MAX_ITEMS: usize = 20;
const MAX_PICTURES: usize = 8;
const PREVIEW_CHARS: usize = 300;
const THUMB_SIDE: u32 = 240;
const POLL: Duration = Duration::from_millis(250);
/// Apps put several formats on the clipboard one after the other.
const SETTLE: Duration = Duration::from_millis(120);
/// A busy clipboard is retried this many times before the copy is skipped.
const READ_ATTEMPTS: u32 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Kind {
    Text,
    Image,
    Files,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ItemView {
    id: u64,
    kind: Kind,
    /// Text: its start, on one line.
    preview: Option<String>,
    chars: Option<usize>,
    /// Pictures: a small PNG (data URL), the full size and the file.
    thumb: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    path: Option<String>,
    /// Files: their names.
    names: Vec<String>,
    screenshot: bool,
    /// Screenshots: when the original file will be deleted (ms since epoch).
    delete_at: Option<u64>,
    /// Screenshots: the user pressed Keep; no auto-delete.
    kept: bool,
    /// App that copied it.
    source: Option<String>,
    copied_at: u64,
    /// Copied again from the island itself: no "copied" pill for it.
    quiet: bool,
}

/// A screenshot file waiting to be deleted. This lives apart from the
/// clipboard history so clearing history or restarting Notchly does not
/// cancel the cleanup.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingShot {
    /// The clipboard item this belongs to in this run. Not persisted: after a
    /// restart there are no history entries to remove.
    #[serde(skip)]
    id: Option<u64>,
    path: Option<PathBuf>,
    copied_at: u64,
    width: u32,
    height: u32,
    delete_at: u64,
}

/// A pending screenshot as the Shelf shows it. Unlike `PendingShot`, this is
/// also available after a restart, when there is no clipboard history row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingView {
    path: String,
    name: String,
    copied_at: u64,
    delete_at: u64,
    thumb: Option<String>,
}

enum Content {
    Text(String),
    Picture { path: PathBuf, fingerprint: u64 },
    Files(Vec<PathBuf>),
}

struct Entry {
    view: ItemView,
    content: Content,
}

#[derive(Serialize)]
struct State {
    items: Vec<ItemView>,
    pending: Vec<PendingView>,
}

struct Ctx {
    hub: Arc<Hub>,
    dir: PathBuf,
    pending_path: PathBuf,
    entries: Mutex<Vec<Entry>>,
    pending: Mutex<Vec<PendingShot>>,
    /// Thumbnails for pending originals. They are generated from the file on
    /// disk because after a restart there is no clipboard entry to borrow one
    /// from. `None` is not cached so a file that appears late can still load.
    pending_thumbs: Mutex<HashMap<String, String>>,
    next_id: AtomicU64,
}

impl Ctx {
    fn publish(&self) {
        let mut items: Vec<ItemView> = self
            .entries
            .lock()
            .unwrap()
            .iter()
            .map(|e| e.view.clone())
            .collect();
        let pending_shots = self.pending.lock().unwrap();
        for view in &mut items {
            if let Some(shot) = pending_shots.iter().find(|p| p.id == Some(view.id)) {
                view.delete_at = Some(shot.delete_at);
            }
        }
        let pending: Vec<PendingView> = pending_shots
            .iter()
            .filter_map(|shot| {
                let path = shot.path.as_ref()?;
                let path_string = path.to_string_lossy().to_string();
                let name = path
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Screenshot".to_string());
                Some(PendingView {
                    thumb: self.pending_thumb(path),
                    path: path_string,
                    name,
                    copied_at: shot.copied_at,
                    delete_at: shot.delete_at,
                })
            })
            .collect();
        drop(pending_shots);
        self.hub.publish(ID, &State { items, pending });
    }

    fn pending_thumb(&self, path: &Path) -> Option<String> {
        let key = path.to_string_lossy().to_string();
        if let Some(thumb) = self.pending_thumbs.lock().unwrap().get(&key).cloned() {
            return Some(thumb);
        }
        let thumb = thumb_for_file(path)?;
        self.pending_thumbs
            .lock()
            .unwrap()
            .insert(key, thumb.clone());
        Some(thumb)
    }

    fn enabled(&self) -> bool {
        self.hub
            .app()
            .state::<Settings>()
            .get(ENABLED_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    }

    fn cleanup_enabled(&self) -> bool {
        self.hub
            .app()
            .state::<Settings>()
            .get(SCREENSHOT_CLEANUP_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    }

    fn cleanup_ttl_ms(&self) -> u64 {
        self.hub
            .app()
            .state::<Settings>()
            .get(SCREENSHOT_TTL_KEY)
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_SCREENSHOT_TTL_MINUTES)
            .clamp(1, MAX_SCREENSHOT_TTL_MINUTES)
            .saturating_mul(60_000)
    }

    /// Forgets everything. True if there was something.
    fn clear(&self) -> bool {
        let mut entries = self.entries.lock().unwrap();
        let had = !entries.is_empty();
        entries.drain(..).for_each(delete_file);
        had
    }

    /// Drops entries older than the retention setting (0 = keep forever).
    fn prune(&self) -> bool {
        let minutes = self
            .hub
            .app()
            .state::<Settings>()
            .get(RETENTION_KEY)
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        if minutes == 0 {
            return false;
        }
        let cutoff = now_ms().saturating_sub(minutes.saturating_mul(60_000));
        let mut entries = self.entries.lock().unwrap();
        let before = entries.len();
        let mut kept = Vec::with_capacity(before);
        for entry in entries.drain(..) {
            if entry.view.copied_at >= cutoff {
                kept.push(entry);
            } else {
                delete_file(entry);
            }
        }
        let changed = kept.len() != before;
        *entries = kept;
        drop(entries);
        if changed {
            self.publish();
        }
        changed
    }

    fn add(&self, copied: Copied, quiet: bool) {
        // Copying something already in the list moves it to the top (same id,
        // so the UI keeps its row).
        let same = |e: &Entry| match (&e.content, &copied.clip) {
            (Content::Text(a), Clip::Text(b)) => a == b,
            (Content::Files(a), Clip::Files(b)) => a == b,
            (Content::Picture { fingerprint, .. }, Clip::Picture(p)) => {
                *fingerprint == image::fingerprint(p)
            }
            _ => false,
        };
        let existing = {
            let mut entries = self.entries.lock().unwrap();
            entries.iter().position(same).map(|i| entries.remove(i))
        };
        let mut entry = match existing {
            Some(mut entry) => {
                entry.view.screenshot |= copied.screenshot;
                // Copied again from the island: it still comes from the original app.
                if !copied.own {
                    entry.view.source = copied.source.or(entry.view.source);
                }
                entry
            }
            None => match self.new_entry(self.next_id.fetch_add(1, Ordering::Relaxed), copied) {
                Some(entry) => entry,
                None => return,
            },
        };
        entry.view.copied_at = now_ms();
        entry.view.quiet = quiet;

        let info = {
            let mut entries = self.entries.lock().unwrap();
            entries.insert(0, entry);
            let mut pictures = 0;
            let mut kept = Vec::with_capacity(entries.len());
            for (i, e) in entries.drain(..).enumerate() {
                let is_picture = matches!(e.content, Content::Picture { .. });
                pictures += is_picture as usize;
                if i < MAX_ITEMS && (!is_picture || pictures <= MAX_PICTURES) {
                    kept.push(e);
                } else {
                    delete_file(e);
                }
            }
            *entries = kept;
            entries.first().map(|e| {
                (
                    e.view.id,
                    e.view.screenshot,
                    e.view.kept,
                    e.view.copied_at,
                    e.view.width.unwrap_or(0),
                    e.view.height.unwrap_or(0),
                )
            })
        };
        if let Some((id, screenshot, was_kept, copied_at, width, height)) = info {
            // Only a screenshot that arrives while we're watching starts a new
            // timer. The first read after launch (or a copy made from the island
            // itself) is `quiet`: don't arm a fresh deadline for an old picture.
            if !quiet {
                let (kept, delete_at) =
                    self.arm_screenshot(id, copied_at, width, height, screenshot, was_kept);
                let mut entries = self.entries.lock().unwrap();
                if let Some(e) = entries.iter_mut().find(|e| e.view.id == id) {
                    e.view.kept = kept;
                    e.view.delete_at = delete_at;
                }
            }
        }
        self.publish();
    }

    /// Arms or disarms the cleanup timer for the clipboard item `id`.
    /// Returns the item's `kept` flag and its new deadline.
    fn arm_screenshot(
        &self,
        id: u64,
        copied_at: u64,
        width: u32,
        height: u32,
        screenshot: bool,
        kept: bool,
    ) -> (bool, Option<u64>) {
        if !screenshot {
            self.remove_pending(id);
            return (false, None);
        }
        if kept {
            self.remove_pending(id);
            return (true, None);
        }
        if !self.cleanup_enabled() {
            self.remove_pending(id);
            return (false, None);
        }
        let delete_at = copied_at.saturating_add(self.cleanup_ttl_ms());
        let original = resolve_original(copied_at, width, height);
        let snapshot = {
            let mut pending = self.pending.lock().unwrap();
            // A re-copy of the same file should replace the older deadline.
            if let Some(path) = original.as_ref() {
                pending.retain(|p| p.id == Some(id) || p.path.as_ref() != Some(path));
            }
            if let Some(shot) = pending.iter_mut().find(|p| p.id == Some(id)) {
                shot.copied_at = copied_at;
                shot.width = width;
                shot.height = height;
                shot.delete_at = delete_at;
                if shot.path.is_none() {
                    shot.path = original;
                }
            } else {
                pending.push(PendingShot {
                    id: Some(id),
                    path: original,
                    copied_at,
                    width,
                    height,
                    delete_at,
                });
            }
            pending.clone()
        };
        save_pending(&self.pending_path, &snapshot);
        (false, Some(delete_at))
    }

    fn remove_pending(&self, id: u64) {
        let snapshot = {
            let mut pending = self.pending.lock().unwrap();
            let before = pending.len();
            pending.retain(|p| p.id != Some(id));
            (pending.len() != before).then(|| pending.clone())
        };
        if let Some(snapshot) = snapshot {
            save_pending(&self.pending_path, &snapshot);
        }
    }

    fn new_entry(&self, id: u64, copied: Copied) -> Option<Entry> {
        let mut view = ItemView {
            id,
            kind: Kind::Text,
            preview: None,
            chars: None,
            thumb: None,
            width: None,
            height: None,
            path: None,
            names: Vec::new(),
            screenshot: copied.screenshot,
            delete_at: None,
            kept: false,
            source: copied.source,
            copied_at: 0,
            quiet: false,
        };
        let content = match copied.clip {
            Clip::Text(text) => {
                view.preview = Some(preview(&text));
                view.chars = Some(text.chars().count());
                Content::Text(text)
            }
            Clip::Files(paths) => {
                view.kind = Kind::Files;
                view.names = paths
                    .iter()
                    .map(|p| {
                        p.file_name()
                            .map_or_else(|| p.to_string_lossy(), |n| n.to_string_lossy())
                            .to_string()
                    })
                    .collect();
                Content::Files(paths)
            }
            Clip::Picture(picture) => {
                view.kind = Kind::Image;
                let path = self.dir.join(format!("clip-{id}.png"));
                let saved = image::encode_png(&picture)
                    .and_then(|png| std::fs::write(&path, png).map_err(|e| e.to_string()));
                if let Err(e) = saved {
                    log::warn!("clipboard: can't save picture: {e}");
                    return None;
                }
                view.thumb = thumb_url(&picture);
                view.width = Some(picture.width);
                view.height = Some(picture.height);
                view.path = Some(path.to_string_lossy().to_string());
                Content::Picture {
                    path,
                    fingerprint: image::fingerprint(&picture),
                }
            }
        };
        Some(Entry { view, content })
    }

    fn find<T>(&self, id: u64, f: impl FnOnce(&Entry) -> T) -> Result<T, String> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .find(|e| e.view.id == id)
            .map(f)
            .ok_or_else(|| "no such item".into())
    }

    /// Puts an item back on the clipboard.
    fn copy(&self, id: u64) -> Result<(), String> {
        enum Owned {
            Text(String),
            Picture(PathBuf),
            Files(Vec<PathBuf>),
        }
        let content = self.find(id, |e| match &e.content {
            Content::Text(t) => Owned::Text(t.clone()),
            Content::Picture { path, .. } => Owned::Picture(path.clone()),
            Content::Files(p) => Owned::Files(p.clone()),
        })?;
        let win = self
            .hub
            .app()
            .get_webview_window(crate::window::ISLAND_LABEL)
            .ok_or("no island window")?;
        let owner = HWND(win.hwnd().map_err(|e| e.to_string())?.0);
        match content {
            Owned::Text(text) => os::write(owner, Payload::Text(&text)),
            Owned::Files(paths) => os::write(owner, Payload::Files(&paths)),
            Owned::Picture(path) => {
                let png = std::fs::read(&path).map_err(|e| e.to_string())?;
                let picture = image::decode_png(&png).ok_or("unreadable picture")?;
                os::write(
                    owner,
                    Payload::Picture {
                        picture: &picture,
                        png: &png,
                    },
                )
            }
        }
    }

    fn remove(&self, id: u64) {
        let removed = {
            let mut entries = self.entries.lock().unwrap();
            entries
                .iter()
                .position(|e| e.view.id == id)
                .map(|i| entries.remove(i))
        };
        if let Some(entry) = removed {
            // Delete means "let the timer delete it": keep the pending record
            // so the original goes away at the deadline, but forget which
            // history row it belonged to. Keep (mark_kept) removes the record
            // instead, preserving the file.
            let snapshot = {
                let mut pending = self.pending.lock().unwrap();
                let mut changed = false;
                if let Some(shot) = pending.iter_mut().find(|p| p.id == Some(id)) {
                    shot.id = None;
                    changed = true;
                }
                changed.then(|| pending.clone())
            };
            if let Some(snapshot) = snapshot {
                save_pending(&self.pending_path, &snapshot);
            }
            delete_file(entry);
            self.publish();
        }
    }

    /// Deletes the original screenshot and its history row immediately.
    fn delete_now(&self, id: u64) -> Result<(), String> {
        let path = {
            let mut pending = self.pending.lock().unwrap();
            let index = pending.iter().position(|p| p.id == Some(id));
            let mut path = None;
            if let Some(i) = index {
                let mut shot = pending.remove(i);
                if shot.path.is_none() {
                    shot.path = resolve_original(shot.copied_at, shot.width, shot.height);
                }
                if let Some(original) = shot.path {
                    path = Some(original);
                } else {
                    // Can't find the original yet: let the cleanup timer keep
                    // trying, but detach it from the row we're removing.
                    shot.id = None;
                    pending.insert(i, shot);
                }
                save_pending(&self.pending_path, &pending);
            }
            path
        };
        if let Some(original) = path {
            if let Err(e) = std::fs::remove_file(&original) {
                log::warn!(
                    "clipboard: can't delete screenshot {}: {e}",
                    original.display()
                );
            }
        }

        let removed = {
            let mut entries = self.entries.lock().unwrap();
            entries
                .iter()
                .position(|e| e.view.id == id)
                .map(|i| entries.remove(i))
        };
        if let Some(entry) = removed {
            delete_file(entry);
            self.publish();
        }
        Ok(())
    }

    /// Cancels a pending screenshot's timer from the Shelf, where records are
    /// addressed by path (they have no clipboard id after a restart).
    fn keep_pending(&self, path: &str) -> Result<String, String> {
        let (id, saved_path, snapshot) = {
            let mut pending = self.pending.lock().unwrap();
            let Some(index) = pending_index(&pending, path) else {
                return Err("no such screenshot".into());
            };
            let shot = pending.remove(index);
            let saved = shot
                .path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string());
            (shot.id, saved, pending.clone())
        };
        save_pending(&self.pending_path, &snapshot);
        if let Some(id) = id {
            let mut entries = self.entries.lock().unwrap();
            if let Some(entry) = entries.iter_mut().find(|e| e.view.id == id) {
                entry.view.kept = true;
                entry.view.delete_at = None;
            }
        }
        self.publish();
        Ok(saved_path)
    }

    /// Deletes a pending screenshot from the Shelf by path, immediately.
    fn delete_pending(&self, path: &str) -> Result<(), String> {
        let (id, original, snapshot) = {
            let mut pending = self.pending.lock().unwrap();
            let Some(index) = pending_index(&pending, path) else {
                return Err("no such screenshot".into());
            };
            let shot = pending.remove(index);
            let original = shot.path.clone().unwrap_or_else(|| PathBuf::from(path));
            (shot.id, original, pending.clone())
        };
        save_pending(&self.pending_path, &snapshot);
        if let Err(e) = std::fs::remove_file(&original) {
            log::warn!(
                "clipboard: can't delete screenshot {}: {e}",
                original.display()
            );
        }
        if let Some(id) = id {
            let removed = {
                let mut entries = self.entries.lock().unwrap();
                entries
                    .iter()
                    .position(|e| e.view.id == id)
                    .map(|i| entries.remove(i))
            };
            if let Some(entry) = removed {
                delete_file(entry);
            }
        }
        self.publish();
        Ok(())
    }

    /// Cancels the screenshot's auto-deletion without putting it on the shelf.
    fn mark_kept(&self, id: u64) -> Result<(), String> {
        let found = {
            let mut entries = self.entries.lock().unwrap();
            entries
                .iter_mut()
                .find(|e| e.view.id == id)
                .map(|e| {
                    if e.view.screenshot {
                        e.view.kept = true;
                        e.view.delete_at = None;
                    }
                })
                .is_some()
        };
        if !found {
            return Err("no such item".into());
        }
        self.remove_pending(id);
        self.publish();
        Ok(())
    }

    /// Deletes originals whose timer is up and drops the matching history
    /// entries. Runs even while the clipboard module is off, so a pending
    /// screenshot is not left behind.
    fn cleanup_screenshots(&self) {
        if !self.cleanup_enabled() {
            let cleared = {
                let mut pending = self.pending.lock().unwrap();
                if pending.is_empty() {
                    None
                } else {
                    pending.clear();
                    Some(Vec::new())
                }
            };
            let pending_changed = cleared.is_some();
            if let Some(snapshot) = cleared {
                save_pending(&self.pending_path, &snapshot);
            }
            let changed = {
                let mut entries = self.entries.lock().unwrap();
                let mut changed = false;
                for entry in entries.iter_mut() {
                    changed |= entry.view.delete_at.take().is_some();
                }
                changed
            };
            if pending_changed || changed {
                self.publish();
            }
            return;
        }

        let now = now_ms();
        let mut expired: Vec<PendingShot> = Vec::new();
        let (snapshot, pending_changed) = {
            let mut pending = self.pending.lock().unwrap();
            let mut resolved = false;
            pending.retain_mut(|shot| {
                if shot.path.is_none()
                    && now <= shot.copied_at.saturating_add(SCREENSHOT_RESOLVE_MS)
                {
                    shot.path = resolve_original(shot.copied_at, shot.width, shot.height);
                    resolved |= shot.path.is_some();
                }
                if shot.delete_at <= now {
                    // One last try: the file may have appeared after the
                    // resolve window (or after a restart).
                    if shot.path.is_none() {
                        shot.path = resolve_original(shot.copied_at, shot.width, shot.height);
                    }
                    expired.push(shot.clone());
                    false
                } else {
                    true
                }
            });
            let changed = resolved || !expired.is_empty();
            (changed.then(|| pending.clone()), changed)
        };
        if let Some(snapshot) = snapshot {
            save_pending(&self.pending_path, &snapshot);
        }
        if expired.is_empty() {
            if pending_changed {
                self.publish();
            }
            return;
        }

        for shot in &expired {
            if let Some(path) = &shot.path {
                if let Err(e) = std::fs::remove_file(path) {
                    log::warn!("clipboard: can't delete screenshot {}: {e}", path.display());
                }
            }
        }

        let ids: Vec<u64> = expired.iter().filter_map(|shot| shot.id).collect();
        if ids.is_empty() {
            // No history rows in this run (usually after a restart), but the
            // pending Shelf still has to lose these entries.
            self.publish();
            return;
        }
        {
            let mut entries = self.entries.lock().unwrap();
            let mut kept = Vec::with_capacity(entries.len());
            for entry in entries.drain(..) {
                if ids.contains(&entry.view.id) {
                    delete_file(entry);
                } else {
                    kept.push(entry);
                }
            }
            *entries = kept;
        }
        self.publish();
    }

    /// Files to drag out of the island.
    fn paths(&self, id: u64) -> Result<Vec<PathBuf>, String> {
        self.find(id, |e| match &e.content {
            Content::Picture { path, .. } => Ok(vec![path.clone()]),
            Content::Files(paths) => Ok(paths.clone()),
            Content::Text(_) => Err("text can't be dragged".to_string()),
        })?
    }

    /// Lasting files for the shelf: the files themselves, or the picture saved
    /// to the Screenshots folder (reusing the copy Snipping Tool saved, if any).
    fn keep(&self, id: u64) -> Result<Vec<String>, String> {
        let (content, view) = self.find(id, |e| {
            let content = match &e.content {
                Content::Picture { path, .. } => Ok(path.clone()),
                Content::Files(paths) => Err(paths.clone()),
                Content::Text(_) => Ok(PathBuf::new()),
            };
            (content, e.view.clone())
        })?;
        let picture = match content {
            Err(files) => {
                return Ok(files
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect());
            }
            Ok(p) if p.as_os_str().is_empty() => return Err("text can't go on the shelf".into()),
            Ok(p) => p,
        };
        let folder = screenshots_folder().ok_or("no Pictures folder")?;
        let size = view.width.zip(view.height).unwrap_or_default();
        if view.screenshot
            && let Some(saved) = resolve_original(view.copied_at, size.0, size.1)
        {
            return Ok(vec![saved.to_string_lossy().to_string()]);
        }
        std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        let name = format!(
            "{} {}.png",
            i18n::t(self.hub.app(), "clipboard.fileName"),
            chrono::Local::now().format("%Y-%m-%d %H.%M.%S")
        );
        let target = folder.join(name);
        std::fs::copy(&picture, &target).map_err(|e| e.to_string())?;
        Ok(vec![target.to_string_lossy().to_string()])
    }

    fn text(&self, id: u64) -> Result<String, String> {
        self.find(id, |e| match &e.content {
            Content::Text(t) => Ok(t.clone()),
            _ => Err("not text".to_string()),
        })?
    }
}

fn delete_file(entry: Entry) {
    if let Content::Picture { path, .. } = entry.content {
        let _ = std::fs::remove_file(path);
    }
}

fn pending_index(pending: &[PendingShot], path: &str) -> Option<usize> {
    pending.iter().position(|shot| {
        shot.path
            .as_ref()
            .is_some_and(|p| p.to_string_lossy().eq_ignore_ascii_case(path))
    })
}

/// One line: whitespace runs collapsed, at most `PREVIEW_CHARS` characters.
fn preview(text: &str) -> String {
    let mut out = String::new();
    for word in text.split_whitespace() {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(word);
        if out.chars().count() >= PREVIEW_CHARS {
            return out.chars().take(PREVIEW_CHARS).collect();
        }
    }
    out
}

fn thumb_url(picture: &Picture) -> Option<String> {
    let png = image::encode_png(&image::thumbnail(picture, THUMB_SIDE)).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}

/// A small data URL for a pending screenshot on disk.
fn thumb_for_file(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let picture = image::decode_png(&bytes)?;
    thumb_url(&picture)
}

fn known_folder(id: &windows::core::GUID) -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{KF_FLAG_DEFAULT, SHGetKnownFolderPath};
    let path = unsafe { SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()? };
    let out = unsafe { path.to_string() }.ok().map(PathBuf::from);
    unsafe { CoTaskMemFree(Some(path.0 as *const _)) };
    out
}

/// `Pictures\Screenshots` (where Windows saves screenshots).
fn screenshots_folder() -> Option<PathBuf> {
    use windows::Win32::UI::Shell::{FOLDERID_Pictures, FOLDERID_Screenshots};
    known_folder(&FOLDERID_Screenshots)
        .or_else(|| known_folder(&FOLDERID_Pictures).map(|p| p.join("Screenshots")))
}

/// `Pictures` itself (where the Snipping Tool can also save).
fn pictures_folder() -> Option<PathBuf> {
    use windows::Win32::UI::Shell::FOLDERID_Pictures;
    known_folder(&FOLDERID_Pictures)
}

/// The original PNG for a screenshot copied at `copied_at`, if it can be
/// found. The Pictures root is searched too, but only for screenshot-looking
/// names so an unrelated image saved at the same moment is never deleted.
fn resolve_original(copied_at: u64, width: u32, height: u32) -> Option<PathBuf> {
    if width == 0 || height == 0 {
        return None;
    }
    let at = UNIX_EPOCH + Duration::from_millis(copied_at);
    let size = (width, height);
    let mut folders = Vec::new();
    if let Some(folder) = screenshots_folder() {
        folders.push((folder, false));
    }
    if let Some(folder) = pictures_folder() {
        folders.push((folder, true));
    }
    let mut seen = HashSet::new();
    for (folder, only_named) in folders {
        if !seen.insert(folder.clone()) {
            continue;
        }
        if let Some(path) = os::saved_screenshot(&folder, at, size, only_named) {
            return Some(path);
        }
    }
    None
}

fn save_pending(path: &Path, pending: &[PendingShot]) {
    let Ok(data) = serde_json::to_vec_pretty(pending) else {
        return;
    };
    let tmp = path.with_extension("json.tmp");
    if let Err(e) = std::fs::write(&tmp, data).and_then(|_| std::fs::rename(&tmp, path)) {
        log::warn!("clipboard: can't save screenshot cleanup: {e}");
        let _ = std::fs::remove_file(&tmp);
    }
}

fn load_and_clean_pending(path: &Path) -> Vec<PendingShot> {
    let now = now_ms();
    let mut pending: Vec<PendingShot> = std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    let mut changed = false;
    for shot in &mut pending {
        if shot.path.is_none() {
            shot.path = resolve_original(shot.copied_at, shot.width, shot.height);
            changed |= shot.path.is_some();
        }
    }
    let before = pending.len();
    pending.retain(|shot| {
        if shot.delete_at > now {
            return true;
        }
        if let Some(path) = &shot.path {
            let _ = std::fs::remove_file(path);
        }
        false
    });
    if changed || pending.len() != before {
        save_pending(path, &pending);
    }
    pending
}

fn watch(ctx: Arc<Ctx>) {
    // `None`: nothing read since start (or since the module was turned on);
    // what's on the clipboard then is listed without the "copied" pill.
    let mut seen: Option<u32> = None;
    let mut failures = 0;
    let mut last_tick = now_ms();
    loop {
        std::thread::sleep(POLL);
        // Screenshot cleanup keeps running while the clipboard module is off;
        // turning the module off should not leave a pending file behind.
        if now_ms().saturating_sub(last_tick) >= 1_000 {
            last_tick = now_ms();
            ctx.cleanup_screenshots();
            if ctx.enabled() {
                ctx.prune();
            }
        }
        if !ctx.enabled() {
            if ctx.clear() {
                ctx.publish();
            }
            seen = None;
            continue;
        }
        let seq = unsafe { GetClipboardSequenceNumber() };
        if seen == Some(seq) {
            continue;
        }
        std::thread::sleep(SETTLE);
        if unsafe { GetClipboardSequenceNumber() } != seq {
            continue;
        }
        let first = seen.is_none();
        match os::read() {
            Ok(copied) => {
                seen = Some(seq);
                failures = 0;
                if let Some(copied) = copied {
                    let quiet = first || copied.own;
                    ctx.add(copied, quiet);
                }
            }
            Err(e) => {
                failures += 1;
                if failures >= READ_ATTEMPTS {
                    log::debug!("clipboard: {e}");
                    seen = Some(seq);
                    failures = 0;
                }
            }
        }
    }
}

#[derive(Default)]
pub struct ClipboardProvider {
    ctx: Mutex<Option<Arc<Ctx>>>,
}

impl Provider for ClipboardProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn start(self: Arc<Self>, hub: Arc<Hub>) {
        let app_dir = hub
            .app()
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir());
        let dir = app_dir.join("clipboard");
        let pending_path = app_dir.join("screenshot-cleanup.json");
        // Pictures from the previous run.
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::create_dir_all(&dir);
        let pending = load_and_clean_pending(&pending_path);
        let ctx = Arc::new(Ctx {
            hub,
            dir,
            pending_path,
            entries: Mutex::default(),
            pending: Mutex::new(pending),
            pending_thumbs: Mutex::default(),
            next_id: AtomicU64::new(1),
        });
        *self.ctx.lock().unwrap() = Some(ctx.clone());
        ctx.publish();
        std::thread::spawn(move || watch(ctx));
    }

    fn action(&self, action: &str, payload: Value) -> Result<Value, String> {
        let ctx = self
            .ctx
            .lock()
            .unwrap()
            .clone()
            .ok_or("clipboard not started")?;
        let id = || {
            payload
                .as_u64()
                .ok_or_else(|| "missing item id".to_string())
        };
        match action {
            "copy" => ctx.copy(id()?)?,
            // Copy it back, return focus to the app, then send Ctrl+V.
            "paste" => {
                ctx.copy(id()?)?;
                crate::window::restore_focus();
                std::thread::sleep(Duration::from_millis(80));
                os::paste();
            }
            "remove" => ctx.remove(id()?),
            // Delete the original screenshot now, not when the timer ends.
            "deleteNow" => ctx.delete_now(id()?)?,
            "clear" => {
                ctx.clear();
                ctx.publish();
            }
            // Drag a picture or files out to any app.
            "drag" => crate::providers::shelf::start_drag(ctx.hub.app(), ctx.paths(id()?)?),
            "open" => {
                if let Some(path) = ctx.paths(id()?)?.first() {
                    crate::settings::open_url(&path.to_string_lossy());
                }
            }
            "keep" => {
                let id = id()?;
                let paths = ctx.keep(id)?;
                // The shelf links to the original file, so it must not be
                // deleted after a successful shelf add.
                ctx.mark_kept(id)?;
                return serde_json::to_value(paths).map_err(|e| e.to_string());
            }
            // Keep a screenshot in place, without adding it to the shelf.
            "keepScreenshot" => ctx.mark_kept(id()?)?,
            // Pending Shelf actions: the record may not have a history id
            // (after a restart), so it is addressed by its original path.
            "keepPending" => {
                let path = payload
                    .as_str()
                    .ok_or_else(|| "missing screenshot path".to_string())?;
                return serde_json::to_value(ctx.keep_pending(path)?).map_err(|e| e.to_string());
            }
            "deletePending" => {
                let path = payload
                    .as_str()
                    .ok_or_else(|| "missing screenshot path".to_string())?;
                ctx.delete_pending(path)?;
            }
            // The whole text (the list only carries a preview).
            "text" => return Ok(Value::String(ctx.text(id()?)?)),
            _ => return Err(format!("{ID}: unknown action '{action}'")),
        }
        Ok(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews() {
        assert_eq!(preview("  hello \n\n  world\t!  "), "hello world !");
        let long = "word ".repeat(200);
        assert_eq!(preview(&long).chars().count(), PREVIEW_CHARS);
    }

    #[test]
    fn finds_screenshot_by_size_and_name() {
        use std::time::SystemTime;

        let dir = std::env::temp_dir().join(format!("notchly-shot-test-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let picture = Picture {
            width: 2,
            height: 2,
            rgba: vec![255; 16],
        };
        let png = image::encode_png(&picture).unwrap();
        let screenshot = dir.join("Screenshot test.png");
        std::fs::write(&screenshot, png).unwrap();
        let now = SystemTime::now();
        assert_eq!(
            os::saved_screenshot(&dir, now, (2, 2), false),
            Some(screenshot.clone())
        );
        assert_eq!(
            os::saved_screenshot(&dir, now, (2, 2), true),
            Some(screenshot.clone())
        );

        let notes = dir.join("notes.png");
        std::fs::rename(&screenshot, &notes).unwrap();
        assert_eq!(
            os::saved_screenshot(&dir, now, (2, 2), false),
            Some(notes.clone())
        );
        assert_eq!(os::saved_screenshot(&dir, now, (2, 2), true), None);
        assert_eq!(os::saved_screenshot(&dir, now, (3, 3), false), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deletes_expired_pending_files() {
        let dir = std::env::temp_dir().join(format!("notchly-pending-test-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let shot = dir.join("Screenshot expired.png");
        std::fs::write(&shot, b"png").unwrap();
        let pending = vec![PendingShot {
            id: None,
            path: Some(shot.clone()),
            copied_at: 0,
            width: 2,
            height: 2,
            delete_at: now_ms().saturating_sub(1),
        }];
        let path = dir.join("pending.json");
        std::fs::write(&path, serde_json::to_vec(&pending).unwrap()).unwrap();
        assert!(load_and_clean_pending(&path).is_empty());
        assert!(!shot.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
