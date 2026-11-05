mod companion;
mod display;
mod file_drop;
mod hub;
mod i18n;
mod pip;
mod portable;
mod providers;
mod screen;
mod settings;
mod shortcuts;
mod tray;
mod updater;
mod window;

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

use hub::Hub;
use providers::Providers;

pub use providers::claude::statusline::BRIDGE_FLAG as STATUSLINE_BRIDGE_FLAG;
pub use providers::claude::statusline::run_bridge as run_statusline_bridge;

/// A global shortcut fired: the frontend opens the "Ask Gemini" or "Find on
/// screen" page. The instant-prompt shortcut opens Ask's one-line field.
const ASK_EVENT: &str = "island://ask";
const ASK_INSTANT_EVENT: &str = "island://ask-instant";
const FIND_EVENT: &str = "island://find";
/// The companion's call/dismiss and Auto/Off shortcuts.
const COMPANION_SUMMON_EVENT: &str = "companion://summon";
const COMPANION_TOGGLE_EVENT: &str = "companion://toggle";

pub fn run() {
    tauri::Builder::default()
        // Must be registered first. Launching the app again opens settings.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = settings::open(app);
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if matches(*shortcut, shortcuts::notch_lock()) {
                        shortcuts::toggle_lock(app);
                        return;
                    }
                    // A locked notch ignores every other global opening too,
                    // including the companion keys and Ask/Find.
                    if shortcuts::is_locked(app) {
                        return;
                    }
                    if matches(*shortcut, shortcuts::companion_summon()) {
                        let _ = app.emit(COMPANION_SUMMON_EVENT, ());
                        return;
                    }
                    if matches(*shortcut, shortcuts::companion_toggle()) {
                        let _ = app.emit(COMPANION_TOGGLE_EVENT, ());
                        return;
                    }
                    let event = if matches(*shortcut, shortcuts::find()) {
                        FIND_EVENT
                    } else if matches(*shortcut, shortcuts::instant()) {
                        ASK_INSTANT_EVENT
                    } else if matches(*shortcut, shortcuts::ask()) {
                        ASK_EVENT
                    } else {
                        return;
                    };
                    open_page(app, event);
                })
                .build(),
        )
        .manage(window::HitState::default())
        .manage(window::DragState::default())
        .manage(i18n::Locale::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(settings::Settings::load(&handle));

            let hub = Arc::new(Hub::new(handle.clone()));
            let providers = providers::registry();
            for provider in &providers {
                provider.clone().start(hub.clone());
            }
            app.manage(hub);
            app.manage(Providers(providers));

            if let Some(win) = app.get_webview_window(window::ISLAND_LABEL) {
                window::make_overlay(&win);
                display::place(&win)?;
                win.set_ignore_cursor_events(true)?;
                win.show()?;
                file_drop::hook(&handle, &win);
            }
            window::spawn_hit_test(handle.clone());
            display::spawn_placement(handle.clone());

            tray::setup(&handle)?;
            tray::enable_autostart_on_first_run(&handle);
            updater::spawn(handle.clone());
            shortcuts::register_saved(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            providers::get_snapshot,
            providers::provider_action,
            providers::activities::test_activity,
            providers::music::lyrics::get_lyrics,
            window::set_hit_rects,
            window::set_dragging,
            window::is_fullscreen_active,
            companion::companion_idle_seconds,
            window::focus_island,
            window::restore_focus,
            display::list_monitors,
            settings::get_settings,
            settings::set_setting,
            settings::export_settings,
            settings::import_settings,
            settings::reset_settings,
            settings::open_settings,
            settings::get_autostart,
            settings::set_autostart,
            shortcuts::set_shortcut,
            shortcuts::set_instant_shortcut,
            shortcuts::get_shortcut_conflicts,
            settings::open_external,
            updater::check_update,
            updater::install_update,
            i18n::set_locale,
            pip::open_pip,
            pip::close_pip,
            pip::is_pip_open,
            pip::pip_snap,
            pip::pip_resize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// True when a registered shortcut is the one the user saved for `event`.
fn matches(pressed: Shortcut, saved: Option<Shortcut>) -> bool {
    saved.is_some_and(|registered| registered == pressed)
}

/// Brings the island forward on a page that takes the keyboard (`event` tells which).
fn open_page(app: &AppHandle, event: &str) {
    if tray::is_hidden(app) {
        return;
    }
    if let Some(win) = app.get_webview_window(window::ISLAND_LABEL) {
        window::allow_activation();
        let _ = win.set_focus();
    }
    let _ = app.emit(event, ());
}
