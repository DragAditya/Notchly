//! User-configurable global shortcuts.
//!
//! The only one so far is the "instant prompt": a combination that opens Ask
//! Gemini's one-line prompt from anywhere. It is stored in the settings as a
//! `global-hotkey` accelerator ("Ctrl+Alt+G") and registered alongside the
//! built-in shortcuts.

use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::settings::Settings;

/// Setting key holding the accelerator (empty = off).
pub const INSTANT_SETTING: &str = "ask.instantShortcut";

static INSTANT: Mutex<Option<Shortcut>> = Mutex::new(None);

/// The registered instant-prompt shortcut, if any.
pub fn instant() -> Option<Shortcut> {
    *INSTANT.lock().unwrap()
}

/// Registers the shortcut saved in the settings (once, during setup).
pub fn register_saved(app: &AppHandle) {
    let combo = app
        .state::<Settings>()
        .get(INSTANT_SETTING)
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default();
    if combo.trim().is_empty() {
        return;
    }
    if let Err(error) = apply(app, &combo) {
        log::warn!("instant ask shortcut '{combo}': {error}");
    }
}

/// Replaces the instant-prompt shortcut. An empty `combo` turns it off.
/// Returns `"invalid"` for an unusable combination and `"taken"` when another
/// app already owns it (the previous shortcut is restored in that case).
pub fn apply(app: &AppHandle, combo: &str) -> Result<(), String> {
    let combo = combo.trim();
    let mut current = INSTANT.lock().unwrap();

    if combo.is_empty() {
        if let Some(old) = current.take() {
            let _ = app.global_shortcut().unregister(old);
        }
        return Ok(());
    }

    let hotkey: Shortcut = combo.parse().map_err(|_| "invalid")?;
    // A bare key would swallow ordinary typing system-wide.
    if hotkey.mods.is_empty() {
        return Err("invalid".into());
    }
    if *current == Some(hotkey) {
        return Ok(());
    }

    // Release the old combination first so swapping works even when the new
    // one is a different modifier order of the same key.
    if let Some(old) = *current {
        let _ = app.global_shortcut().unregister(old);
    }
    match app.global_shortcut().register(hotkey) {
        Ok(()) => {
            *current = Some(hotkey);
            Ok(())
        }
        Err(_) => {
            // Give the old one back; the new combination belongs to someone else.
            if let Some(old) = *current {
                let _ = app.global_shortcut().register(old);
            }
            Err("taken".into())
        }
    }
}

/// Settings-window command: register first (so a conflict can be reported),
/// then store the value.
#[tauri::command]
pub fn set_instant_shortcut(app: AppHandle, combo: String) -> Result<(), String> {
    apply(&app, &combo)?;
    crate::settings::set(
        &app,
        INSTANT_SETTING,
        serde_json::Value::String(combo.trim().into()),
    );
    Ok(())
}
