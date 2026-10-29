//! Windows power mode (the Settings slider: best efficiency, balanced, best
//! performance). The effective overlay scheme changes when the user moves it,
//! so poll it and show a signal card.

use std::time::Duration;

use windows::Win32::Foundation::{ERROR_SUCCESS, WIN32_ERROR};
use windows::core::GUID;

use super::{Activities, Activity, BLUE, GREEN, ORANGE, Style};
use crate::i18n;

const POLL: Duration = Duration::from_secs(2);
const SHOW_FOR: Duration = Duration::from_secs(4);

const BEST_EFFICIENCY: GUID = GUID::from_u128(0x961cc777_2547_4f9d_8174_7d86181b8a7a);
const BALANCED: GUID = GUID::zeroed();
const BEST_PERFORMANCE: GUID = GUID::from_u128(0xded574b5_45a0_4f42_8737_46345c09c238);
const PERFORMANCE: GUID = GUID::from_u128(0x3af9b8d9_7c97_431d_ad78_34a8bfea439f);

// The *actual* scheme is the user's choice. The effective one can be clamped
// by battery saver, which would hide every change while the battery is low.
windows::core::link!(
    "powrprof.dll" "system" fn PowerGetActualOverlayScheme(guid: *mut GUID) -> WIN32_ERROR
);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Efficiency,
    Balanced,
    Performance,
    Custom,
}

impl Mode {
    fn of(guid: GUID) -> Self {
        if guid == BEST_EFFICIENCY {
            Self::Efficiency
        } else if guid == BALANCED {
            Self::Balanced
        } else if guid == BEST_PERFORMANCE || guid == PERFORMANCE {
            Self::Performance
        } else {
            Self::Custom
        }
    }

    fn title(self) -> &'static str {
        match self {
            Self::Efficiency => "system.power.efficiency",
            Self::Balanced => "system.power.balanced",
            Self::Performance => "system.power.performance",
            Self::Custom => "system.power.custom",
        }
    }

    fn color(self) -> &'static str {
        match self {
            Self::Efficiency => GREEN,
            Self::Balanced => BLUE,
            Self::Performance => ORANGE,
            Self::Custom => BLUE,
        }
    }

    fn tone(self) -> &'static str {
        match self {
            Self::Efficiency => "drop",
            Self::Performance => "zap",
            _ => "slide",
        }
    }
}

pub fn watch(activities: Activities) {
    let mut last: Option<Mode> = None;
    loop {
        if let Some(mode) = read() {
            if last.is_some_and(|before| before != mode) {
                show(&activities, mode);
            }
            last = Some(mode);
        }
        std::thread::sleep(POLL);
    }
}

fn read() -> Option<Mode> {
    let mut guid = GUID::zeroed();
    let result = unsafe { PowerGetActualOverlayScheme(&mut guid) };
    (result == ERROR_SUCCESS).then(|| Mode::of(guid))
}

fn show(activities: &Activities, mode: Mode) {
    let app = activities.app();
    let mut alert = Activity::alert("system.power", "power", SHOW_FOR);
    alert.title = i18n::t(app, mode.title());
    alert.subtitle = Some(i18n::t(app, "system.power.title"));
    alert.icon = Some("pulse".into());
    alert.color = Some(mode.color().into());
    alert.priority = 100;
    alert.style = Style::Signal;
    alert.tone = Some(mode.tone().into());
    alert.expand = true;
    activities.upsert(alert);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modes() {
        assert_eq!(Mode::of(BEST_EFFICIENCY), Mode::Efficiency);
        assert_eq!(Mode::of(BALANCED), Mode::Balanced);
        assert_eq!(Mode::of(BEST_PERFORMANCE), Mode::Performance);
        assert_eq!(Mode::of(GUID::from_u128(1)), Mode::Custom);
    }
}
