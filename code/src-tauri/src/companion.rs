//! Safe activity signals for the companion eyes.
//!
//! Only the time since the last keyboard or mouse input is read. No key codes,
//! window contents, clipboard data or screen pixels are inspected, and nothing
//! leaves the machine.

/// Seconds since the last keyboard or mouse input (`0` if unknown).
#[tauri::command]
pub fn companion_idle_seconds() -> u64 {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::SystemInformation::GetTickCount;
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut info).as_bool() {
            let now = GetTickCount();
            return now.wrapping_sub(info.dwTime) as u64 / 1000;
        }
    }
    0
}
