// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Claude Code statusline bridge: short-lived CLI mode, no GUI.
    if std::env::args().any(|a| a == notchly_lib::STATUSLINE_BRIDGE_FLAG) {
        notchly_lib::run_statusline_bridge();
        return;
    }
    notchly_lib::run()
}
