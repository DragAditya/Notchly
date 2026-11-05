//! User-configurable global shortcuts.
//!
//! Ask, Find and the two companion keys have defaults but can be changed (or
//! turned off) from Advanced. The "instant prompt" shortcut belongs to Ask's
//! own settings page. Combinations are stored in the settings as
//! `global-hotkey` accelerators ("Ctrl+Alt+G") and registered at startup.

use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::settings::Settings;

/// Setting key holding the instant-prompt accelerator (empty = off).
pub const INSTANT_SETTING: &str = "ask.instantShortcut";
pub const ASK_SETTING: &str = "shortcuts.ask";
pub const FIND_SETTING: &str = "shortcuts.find";
pub const SUMMON_SETTING: &str = "shortcuts.companionSummon";
pub const TOGGLE_SETTING: &str = "shortcuts.companionToggle";
pub const LOCK_SETTING: &str = "shortcuts.notchLock";
pub const LOCK_KEY: &str = "island.locked";

const ASK_DEFAULT: &str = "Ctrl+Alt+Space";
const ASK_FALLBACK: &str = "Ctrl+Shift+Space";
const FIND_DEFAULT: &str = "Ctrl+Alt+F";
const SUMMON_DEFAULT: &str = "Ctrl+Alt+R";
const TOGGLE_DEFAULT: &str = "Ctrl+Alt+Shift+R";
const LOCK_DEFAULT: &str = "Ctrl+Alt+L";

static INSTANT: Mutex<Option<Shortcut>> = Mutex::new(None);
static ASK: Mutex<Option<Shortcut>> = Mutex::new(None);
static FIND: Mutex<Option<Shortcut>> = Mutex::new(None);
static SUMMON: Mutex<Option<Shortcut>> = Mutex::new(None);
static TOGGLE: Mutex<Option<Shortcut>> = Mutex::new(None);
static LOCK: Mutex<Option<Shortcut>> = Mutex::new(None);

/// A saved shortcut that could not be registered at startup. The settings
/// window shows these so a conflict does not stay hidden in the log.
#[derive(Clone, Serialize)]
pub struct ShortcutConflict {
    pub key: String,
    pub combo: String,
    pub reason: String,
}

static CONFLICTS: Mutex<Vec<ShortcutConflict>> = Mutex::new(Vec::new());

/// The registered instant-prompt shortcut, if any.
pub fn instant() -> Option<Shortcut> {
    *INSTANT.lock().unwrap()
}

pub fn ask() -> Option<Shortcut> {
    *ASK.lock().unwrap()
}

pub fn find() -> Option<Shortcut> {
    *FIND.lock().unwrap()
}

pub fn companion_summon() -> Option<Shortcut> {
    *SUMMON.lock().unwrap()
}

pub fn companion_toggle() -> Option<Shortcut> {
    *TOGGLE.lock().unwrap()
}

pub fn notch_lock() -> Option<Shortcut> {
    *LOCK.lock().unwrap()
}

fn clear_conflict(key: &str) {
    CONFLICTS
        .lock()
        .unwrap()
        .retain(|conflict| conflict.key != key);
}

fn set_conflict(key: &str, combo: &str, reason: &str) {
    let mut conflicts = CONFLICTS.lock().unwrap();
    conflicts.retain(|conflict| conflict.key != key);
    conflicts.push(ShortcutConflict {
        key: key.to_string(),
        combo: combo.to_string(),
        reason: reason.to_string(),
    });
}

/// Startup shortcut failures for the Advanced page.
#[tauri::command]
pub fn get_shortcut_conflicts() -> Vec<ShortcutConflict> {
    CONFLICTS.lock().unwrap().clone()
}

fn slot(key: &str) -> Option<&'static Mutex<Option<Shortcut>>> {
    match key {
        INSTANT_SETTING => Some(&INSTANT),
        ASK_SETTING => Some(&ASK),
        FIND_SETTING => Some(&FIND),
        SUMMON_SETTING => Some(&SUMMON),
        TOGGLE_SETTING => Some(&TOGGLE),
        LOCK_SETTING => Some(&LOCK),
        _ => None,
    }
}

fn default_for(key: &str) -> &'static str {
    match key {
        ASK_SETTING => ASK_DEFAULT,
        FIND_SETTING => FIND_DEFAULT,
        SUMMON_SETTING => SUMMON_DEFAULT,
        TOGGLE_SETTING => TOGGLE_DEFAULT,
        LOCK_SETTING => LOCK_DEFAULT,
        _ => "",
    }
}

fn fallback_for(key: &str) -> Option<&'static str> {
    (key == ASK_SETTING).then_some(ASK_FALLBACK)
}

/// True when the notch is locked: visible, but ignoring all interaction.
pub fn is_locked(app: &AppHandle) -> bool {
    app.try_state::<Settings>()
        .and_then(|settings| settings.get(LOCK_KEY))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

/// Flips `island.locked`; every window hears about it through `settings://changed`.
pub fn toggle_lock(app: &AppHandle) {
    crate::settings::set(app, LOCK_KEY, Value::Bool(!is_locked(app)));
}

/// Registers every shortcut saved in the settings (once, during setup).
pub fn register_saved(app: &AppHandle) {
    for key in [
        ASK_SETTING,
        FIND_SETTING,
        SUMMON_SETTING,
        TOGGLE_SETTING,
        LOCK_SETTING,
        INSTANT_SETTING,
    ] {
        let saved = app
            .state::<Settings>()
            .get(key)
            .and_then(|value| value.as_str().map(str::to_string));
        let combo = saved
            .clone()
            .unwrap_or_else(|| default_for(key).to_string());
        if combo.trim().is_empty() {
            // Also clears a shortcut that was registered before an import or
            // reset removed its setting.
            let _ = apply(app, key, "");
            continue;
        }
        if let Err(error) = apply(app, key, &combo) {
            // The default Ask key has a second chance; a user's choice does not.
            if saved.is_none() {
                if let Some(fallback) = fallback_for(key) {
                    if apply(app, key, fallback).is_ok() {
                        continue;
                    }
                }
            }
            log::warn!("shortcut {key} '{combo}': {error}");
            set_conflict(key, &combo, &error);
        }
    }
}

/// Replaces one shortcut. An empty `combo` turns it off. Returns `"invalid"`
/// for an unusable combination and `"taken"` when another app already owns it
/// (the previous shortcut is restored in that case).
pub fn apply(app: &AppHandle, key: &str, combo: &str) -> Result<(), String> {
    let Some(slot) = slot(key) else {
        return Err("unknown".into());
    };
    let combo = combo.trim();
    let mut current = slot.lock().unwrap();

    if combo.is_empty() {
        if let Some(old) = current.take() {
            let _ = app.global_shortcut().unregister(old);
        }
        sync_hotkey_label(key, None);
        clear_conflict(key);
        return Ok(());
    }

    let hotkey: Shortcut = combo.parse().map_err(|_| "invalid")?;
    // A bare key would swallow ordinary typing system-wide.
    if hotkey.mods.is_empty() {
        return Err("invalid".into());
    }
    if *current == Some(hotkey) {
        sync_hotkey_label(key, Some(combo.to_string()));
        clear_conflict(key);
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
            sync_hotkey_label(key, Some(combo.to_string()));
            clear_conflict(key);
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

fn sync_hotkey_label(key: &str, label: Option<String>) {
    match key {
        ASK_SETTING => crate::providers::ask::set_hotkey(label),
        FIND_SETTING => crate::providers::find::set_hotkey(label),
        _ => {}
    }
}

/// Settings-window command: register first (so a conflict can be reported),
/// then store the value.
#[tauri::command]
pub fn set_shortcut(app: AppHandle, key: String, combo: String) -> Result<(), String> {
    apply(&app, &key, &combo)?;
    crate::settings::set(&app, &key, Value::String(combo.trim().to_string()));
    Ok(())
}

/// Ask's own settings page still uses this older command name.
#[tauri::command]
pub fn set_instant_shortcut(app: AppHandle, combo: String) -> Result<(), String> {
    set_shortcut(app, INSTANT_SETTING.into(), combo)
}
