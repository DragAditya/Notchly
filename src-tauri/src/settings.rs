//! User settings: a flat JSON key/value store persisted in the app config dir.
//!
//! The backend doesn't know the schema — defaults and meaning live in the
//! frontend (each module declares its own settings). Every change is broadcast
//! as `settings://changed` so all windows stay in sync.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;

pub const CHANGED_EVENT: &str = "settings://changed";
pub const SETTINGS_LABEL: &str = "settings";

/// One-time friendly upgrade from a previous app-data directory. Copy the
/// user's existing files before the first read so a bundle-id change doesn't
/// lose settings, the shelf or pending screenshot cleanup records.
fn migrate_legacy(dir: &Path) {
    if dir
        .read_dir()
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false)
    {
        return;
    }
    let Ok(appdata) = std::env::var("APPDATA") else {
        return;
    };
    for id in ["com.dragaditya.notchly", "com.heyyczer.dynamicisland"] {
        let old = Path::new(&appdata).join(id);
        if old.is_dir() && copy_dir(&old, dir).is_ok() {
            return;
        }
    }
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

pub struct Settings {
    path: PathBuf,
    data: Mutex<Map<String, Value>>,
}

impl Settings {
    pub fn load(app: &AppHandle) -> Self {
        let dir = app
            .path()
            .app_config_dir()
            .unwrap_or_else(|_| std::env::temp_dir());
        let path = dir.join("settings.json");
        migrate_legacy(&dir);
        let data = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str::<Map<String, Value>>(&t).ok())
            .unwrap_or_default();
        Self {
            path,
            data: Mutex::new(data),
        }
    }

    /// Current raw value of a setting (`None` = never set, use the default).
    pub fn get(&self, key: &str) -> Option<Value> {
        self.data.lock().unwrap().get(key).cloned()
    }

    fn save(&self, data: &Map<String, Value>) {
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string_pretty(data) {
            let _ = std::fs::write(&self.path, text);
        }
    }
}

#[tauri::command]
pub fn get_settings(settings: State<Settings>) -> Map<String, Value> {
    settings.data.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_setting(app: AppHandle, key: String, value: Value) {
    set(&app, &key, value);
}

/// Pretty JSON snapshot for the Advanced page's export button.
#[tauri::command]
pub fn export_settings(settings: State<Settings>) -> String {
    let data = settings.data.lock().unwrap();
    serde_json::to_string_pretty(&*data).unwrap_or_else(|_| "{}".into())
}

/// Replaces every setting from a JSON object. The frontend validates the file
/// before calling this; a bad payload is rejected rather than partially applied.
#[tauri::command]
pub fn import_settings(app: AppHandle, json: String) -> Result<(), String> {
    let data: Map<String, Value> =
        serde_json::from_str(&json).map_err(|_| "invalid settings file".to_string())?;
    replace(&app, data);
    crate::shortcuts::register_saved(&app);
    Ok(())
}

/// Removes the given keys so their defaults apply again. An empty list resets
/// everything, including keys written by older versions.
#[tauri::command]
pub fn reset_settings(app: AppHandle, keys: Vec<String>) {
    let settings = app.state::<Settings>();
    let snapshot = {
        let mut data = settings.data.lock().unwrap();
        if keys.is_empty() {
            data.clear();
        } else {
            for key in keys {
                data.remove(&key);
            }
        }
        settings.save(&data);
        data.clone()
    };
    let _ = app.emit(CHANGED_EVENT, snapshot);
    crate::tray::sync_hidden(&app);
    crate::tray::sync_lock(&app);
    crate::shortcuts::register_saved(&app);
}

fn replace(app: &AppHandle, data: Map<String, Value>) {
    let settings = app.state::<Settings>();
    let snapshot = {
        let mut current = settings.data.lock().unwrap();
        *current = data;
        settings.save(&current);
        current.clone()
    };
    let _ = app.emit(CHANGED_EVENT, snapshot);
    crate::tray::sync_hidden(app);
    crate::tray::sync_lock(app);
}

/// Store and broadcast a setting (backend side of `setSetting`).
pub fn set(app: &AppHandle, key: &str, value: Value) {
    let settings = app.state::<Settings>();
    let snapshot = {
        let mut data = settings.data.lock().unwrap();
        data.insert(key.to_string(), value);
        settings.save(&data);
        data.clone()
    };
    let _ = app.emit(CHANGED_EVENT, snapshot);
    if key == crate::tray::HIDDEN_KEY {
        crate::tray::sync_hidden(app);
    }
    if key == crate::shortcuts::LOCK_KEY {
        crate::tray::sync_lock(app);
    }
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|e| e.to_string())
}

const SIZE: (f64, f64) = (860.0, 620.0);

pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(SETTINGS_LABEL) {
        win.unminimize()?;
        win.show()?;
        return win.set_focus();
    }
    // Callers are sync commands / tray / single-instance handlers on the main
    // thread, where building a webview deadlocks on Windows (WebView2 needs the
    // event loop). Build from another thread instead.
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = create(&app) {
            eprintln!("settings window: {e}");
        }
    });
    Ok(())
}

fn create(app: &AppHandle) -> tauri::Result<()> {
    let _win = WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
        .title(crate::i18n::t(app, "window.settings"))
        .inner_size(SIZE.0, SIZE.1)
        .resizable(false)
        .center()
        // Custom titlebar lives in the webview (see `SettingsApp.tsx`).
        .decorations(false)
        .background_color(tauri::webview::Color(12, 12, 16, 255))
        .build()?;
    Ok(())
}

/// Open a web page in the default browser (island links, e.g. usage pages).
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only https links".into());
    }
    open_url(&url);
    Ok(())
}

/// Open a URL in the default browser.
pub fn open_url(url: &str) {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        use windows::core::{HSTRING, PCWSTR, w};
        ShellExecuteW(
            None,
            w!("open"),
            &HSTRING::from(url),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
    }
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    result.map_err(|e| e.to_string())?;
    Ok(launcher.is_enabled().unwrap_or(false))
}
