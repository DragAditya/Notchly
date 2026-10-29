//! Display brightness OSD: when the primary monitor's brightness changes,
//! the island shows a premium signal card with the new level.
//!
//! External monitors are read through DDC/CI (DXVA2). Internal laptop panels
//! often do not expose DDC/CI, so they fall back to the WMI
//! `WmiMonitorBrightness` class. Displays that expose neither simply hide the
//! setting.

use std::sync::OnceLock;
use std::time::Duration;

use windows::Win32::Devices::Display::{
    DestroyPhysicalMonitor, GetMonitorBrightness, GetNumberOfPhysicalMonitorsFromHMONITOR,
    GetPhysicalMonitorsFromHMONITOR, PHYSICAL_MONITOR,
};
use windows::Win32::Foundation::{POINT, RPC_E_CHANGED_MODE};
use windows::Win32::Graphics::Gdi::{MONITOR_DEFAULTTOPRIMARY, MonitorFromPoint};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
    CoSetProxyBlanket, CoUninitialize, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL,
    RPC_C_IMP_LEVEL_IMPERSONATE,
};
use windows::Win32::System::Variant::{
    VARIANT, VT_I1, VT_I2, VT_I4, VT_INT, VT_UI1, VT_UI2, VT_UI4, VT_UINT, VariantClear,
};
use windows::Win32::System::Wmi::{
    IWbemContext, IWbemLocator, IWbemServices, WBEM_FLAG_FORWARD_ONLY,
    WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_INFINITE, WbemLocator,
};
use windows::core::{BSTR, PCWSTR, w};

use super::{Activities, Activity, Style, YELLOW};
use crate::i18n;

const POLL: Duration = Duration::from_millis(200);
const SHOW_FOR: Duration = Duration::from_millis(2200);

static SOURCE: OnceLock<Option<Source>> = OnceLock::new();

#[derive(Clone, Copy, Debug)]
enum Source {
    Ddc,
    Wmi,
}

/// True when the primary display exposes a brightness range.
pub fn present() -> bool {
    source().is_some()
}

fn source() -> Option<Source> {
    *SOURCE.get_or_init(|| {
        if read_ddc().is_some() {
            log::debug!("brightness: using DDC/CI");
            return Some(Source::Ddc);
        }

        let wmi = WmiReader::new().and_then(|mut reader| reader.read());
        if wmi.is_some() {
            log::debug!("brightness: using WMI");
            return Some(Source::Wmi);
        }

        log::debug!("brightness: no controllable primary display");
        None
    })
}

pub fn watch(activities: Activities) {
    let Some(source) = source() else {
        return;
    };

    let mut last: Option<u8> = None;
    match source {
        Source::Ddc => loop {
            update(&activities, &mut last, read_ddc());
            std::thread::sleep(POLL);
        },
        Source::Wmi => {
            let Some(mut reader) = WmiReader::new() else {
                log::debug!("brightness: WMI became unavailable");
                return;
            };
            loop {
                update(&activities, &mut last, reader.read());
                std::thread::sleep(POLL);
            }
        }
    }
}

fn update(activities: &Activities, last: &mut Option<u8>, current: Option<u8>) {
    match current {
        Some(percent) => {
            if last.is_some_and(|before| before != percent) {
                show(activities, percent);
            }
            *last = Some(percent);
        }
        None => *last = None,
    }
}

/// Current brightness of the first physical monitor that supports DDC/CI, as 0..100.
fn read_ddc() -> Option<u8> {
    unsafe {
        let monitor = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
        if monitor.is_invalid() {
            return None;
        }

        let mut count = 0u32;
        GetNumberOfPhysicalMonitorsFromHMONITOR(monitor, &mut count).ok()?;
        if count == 0 {
            return None;
        }

        let mut monitors = vec![PHYSICAL_MONITOR::default(); count as usize];
        GetPhysicalMonitorsFromHMONITOR(monitor, &mut monitors).ok()?;

        let mut result = None;
        for physical in &monitors {
            let mut minimum = 0u32;
            let mut current = 0u32;
            let mut maximum = 0u32;
            if GetMonitorBrightness(
                physical.hPhysicalMonitor,
                &mut minimum,
                &mut current,
                &mut maximum,
            ) != 0
                && maximum > minimum
            {
                let percent = ((current.saturating_sub(minimum) as u64 * 100)
                    / (maximum - minimum) as u64)
                    .min(100) as u8;
                result = Some(percent);
                break;
            }
        }

        for physical in &monitors {
            let _ = DestroyPhysicalMonitor(physical.hPhysicalMonitor);
        }
        result
    }
}

/// Keeps COM initialized for the lifetime of a WMI reader. The reader's
/// services field is declared first so it is released before `CoUninitialize`.
struct ComGuard {
    owns: bool,
}

impl ComGuard {
    fn new() -> Option<Self> {
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if hr == RPC_E_CHANGED_MODE {
            // The caller's thread is already in an STA (Tauri setup runs
            // there). WMI can still be called from that apartment.
            return Some(Self { owns: false });
        }
        if hr.ok().is_err() {
            log::debug!("brightness: CoInitializeEx failed: {hr:?}");
            return None;
        }
        Some(Self { owns: true })
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.owns {
            unsafe { CoUninitialize() };
        }
    }
}

struct WmiReader {
    services: IWbemServices,
    _com: ComGuard,
}

impl WmiReader {
    fn new() -> Option<Self> {
        let com = ComGuard::new()?;
        unsafe {
            let locator: IWbemLocator =
                match CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER) {
                    Ok(locator) => locator,
                    Err(error) => {
                        log::debug!("brightness: WMI CoCreateInstance failed: {error:?}");
                        return None;
                    }
                };
            let empty = BSTR::from("");
            let services = match locator.ConnectServer(
                &BSTR::from("ROOT\\WMI"),
                &empty,
                &empty,
                &empty,
                0,
                &empty,
                None::<&IWbemContext>,
            ) {
                Ok(services) => services,
                Err(error) => {
                    log::debug!("brightness: WMI ConnectServer failed: {error:?}");
                    return None;
                }
            };
            let _ = CoSetProxyBlanket(
                &services,
                10, // RPC_C_AUTHN_WINNT
                0,  // RPC_C_AUTHZ_NONE
                PCWSTR::null(),
                RPC_C_AUTHN_LEVEL_CALL,
                RPC_C_IMP_LEVEL_IMPERSONATE,
                None,
                EOAC_NONE,
            );
            Some(Self {
                services,
                _com: com,
            })
        }
    }

    fn read(&mut self) -> Option<u8> {
        unsafe {
            let enumerator = match self.services.ExecQuery(
                &BSTR::from("WQL"),
                &BSTR::from("SELECT CurrentBrightness FROM WmiMonitorBrightness"),
                WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                None::<&IWbemContext>,
            ) {
                Ok(enumerator) => enumerator,
                Err(error) => {
                    log::debug!("brightness: WMI ExecQuery failed: {error:?}");
                    return None;
                }
            };

            let mut objects = [None];
            let mut returned = 0u32;
            let next = enumerator.Next(WBEM_INFINITE, &mut objects, &mut returned);
            if next.ok().is_err() {
                log::debug!("brightness: WMI Next failed: {next:?}");
                return None;
            }
            if returned == 0 {
                log::debug!("brightness: WMI returned no instances");
                return None;
            }

            let object = objects[0].take()?;
            let mut value = VARIANT::default();
            if let Err(error) = object.Get(w!("CurrentBrightness"), 0, &mut value, None, None) {
                log::debug!("brightness: WMI Get failed: {error:?}");
                return None;
            }

            let inner = &value.Anonymous.Anonymous;
            let percent = match inner.vt {
                VT_UI1 => Some(inner.Anonymous.bVal),
                VT_UI2 => Some(inner.Anonymous.uiVal as u8),
                VT_UI4 => Some(inner.Anonymous.ulVal as u8),
                VT_UINT => Some(inner.Anonymous.uintVal as u8),
                VT_I1 => Some(inner.Anonymous.cVal.max(0) as u8),
                VT_I2 => Some(inner.Anonymous.iVal.max(0) as u8),
                VT_I4 => Some(inner.Anonymous.lVal.max(0) as u8),
                VT_INT => Some(inner.Anonymous.intVal.max(0) as u8),
                _ => None,
            };
            let _ = VariantClear(&mut value);
            percent.map(|p| p.min(100))
        }
    }
}

fn show(activities: &Activities, percent: u8) {
    let app = activities.app();
    let mut alert = Activity::alert("system.brightness", "brightness", SHOW_FOR);
    alert.title = i18n::t(app, "system.brightness.title");
    alert.subtitle = Some(i18n::t(app, "system.brightness.display"));
    alert.icon = Some("brightness".into());
    alert.color = Some(YELLOW.into());
    alert.progress = Some(percent as f64 / 100.0);
    alert.priority = 100;
    alert.style = Style::Signal;
    alert.tone = Some("slide".into());
    alert.expand = true;
    activities.upsert(alert);
}
