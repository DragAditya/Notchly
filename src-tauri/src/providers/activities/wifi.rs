//! Wi-Fi signal cards: joining a network, dropping off it, and the short
//! "looking for networks" state while Windows is associating.
//!
//! Uses the native WLAN API instead of parsing localized `netsh` output, so the
//! SSID and signal quality work on every Windows language.

use std::ffi::c_void;
use std::ptr::null_mut;
use std::time::Duration;

use windows::Win32::Foundation::HANDLE;
use windows::Win32::NetworkManagement::WiFi::{
    DOT11_SSID, WLAN_CONNECTION_ATTRIBUTES, WLAN_INTERFACE_INFO_LIST, WlanCloseHandle,
    WlanEnumInterfaces, WlanFreeMemory, WlanOpenHandle, WlanQueryInterface,
    wlan_interface_state_associating, wlan_interface_state_authenticating,
    wlan_interface_state_connected, wlan_interface_state_discovering,
    wlan_intf_opcode_current_connection,
};

use super::{Activities, Activity, BLUE, RED, Style};
use crate::i18n;

const POLL: Duration = Duration::from_millis(2_500);
const SHOW_FOR: Duration = Duration::from_secs(3);
const CLIENT_VERSION: u32 = 2;

#[derive(Clone, Debug, PartialEq, Eq)]
struct WifiState {
    connected: bool,
    ssid: Option<String>,
    signal: Option<u8>,
    searching: bool,
}

pub fn watch(activities: Activities) {
    let mut last: Option<WifiState> = None;
    loop {
        if let Some(state) = read_state() {
            if let Some(previous) = &last {
                if previous.connected != state.connected {
                    if state.connected {
                        show_connected(&activities, &state);
                    } else {
                        show_disconnected(&activities, &state);
                    }
                } else if state.connected && previous.ssid != state.ssid {
                    // Roamed to another network while staying online.
                    show_connected(&activities, &state);
                } else if !state.connected && state.searching && !previous.searching {
                    show_disconnected(&activities, &state);
                }
            }
            last = Some(state);
        }
        std::thread::sleep(POLL);
    }
}

fn open_handle() -> Option<HANDLE> {
    let mut negotiated = 0u32;
    let mut handle = HANDLE::default();
    let result = unsafe { WlanOpenHandle(CLIENT_VERSION, None, &mut negotiated, &mut handle) };
    (result == 0).then_some(handle)
}

fn read_state() -> Option<WifiState> {
    let handle = open_handle()?;
    let state = read_interfaces(handle);
    unsafe {
        let _ = WlanCloseHandle(handle, None);
    }
    state
}

fn read_interfaces(handle: HANDLE) -> Option<WifiState> {
    let mut list: *mut WLAN_INTERFACE_INFO_LIST = null_mut();
    let result = unsafe { WlanEnumInterfaces(handle, None, &mut list) };
    if result != 0 || list.is_null() {
        return None;
    }

    let state = unsafe {
        let count = (*list).dwNumberOfItems as usize;
        let infos = std::slice::from_raw_parts((*list).InterfaceInfo.as_ptr(), count);
        let mut fallback: Option<WifiState> = None;

        for info in infos {
            if info.isState == wlan_interface_state_connected {
                if let Some(state) = query_connection(handle, &info.InterfaceGuid) {
                    WlanFreeMemory(list as *const c_void);
                    return Some(state);
                }
                fallback = Some(WifiState {
                    connected: true,
                    ssid: None,
                    signal: None,
                    searching: false,
                });
            } else if info.isState == wlan_interface_state_associating
                || info.isState == wlan_interface_state_authenticating
                || info.isState == wlan_interface_state_discovering
            {
                fallback = Some(WifiState {
                    connected: false,
                    ssid: None,
                    signal: None,
                    searching: true,
                });
            } else if fallback.is_none() {
                fallback = Some(WifiState {
                    connected: false,
                    ssid: None,
                    signal: None,
                    searching: false,
                });
            }
        }

        WlanFreeMemory(list as *const c_void);
        fallback
    };

    state
}

fn query_connection(handle: HANDLE, guid: &windows::core::GUID) -> Option<WifiState> {
    let mut size = 0u32;
    let mut data: *mut c_void = null_mut();
    let result = unsafe {
        WlanQueryInterface(
            handle,
            guid,
            wlan_intf_opcode_current_connection,
            None,
            &mut size,
            &mut data,
            None,
        )
    };
    if result != 0 || data.is_null() {
        return None;
    }

    let state = unsafe {
        let attributes = &*(data as *const WLAN_CONNECTION_ATTRIBUTES);
        let association = &attributes.wlanAssociationAttributes;
        let ssid = ssid_string(&association.dot11Ssid);
        let signal = Some(association.wlanSignalQuality.min(100) as u8);
        WlanFreeMemory(data as *const c_void);
        WifiState {
            connected: true,
            ssid,
            signal,
            searching: false,
        }
    };

    Some(state)
}

fn ssid_string(ssid: &DOT11_SSID) -> Option<String> {
    let length = (ssid.uSSIDLength as usize).min(ssid.ucSSID.len());
    let text = String::from_utf8_lossy(&ssid.ucSSID[..length])
        .trim()
        .to_string();
    (!text.is_empty()).then_some(text)
}

fn show_connected(activities: &Activities, state: &WifiState) {
    let app = activities.app();
    let mut alert = Activity::alert("system.wifi.connected", "wifi", SHOW_FOR);
    alert.title = state
        .ssid
        .clone()
        .unwrap_or_else(|| i18n::t(app, "system.wifi.title"));
    alert.subtitle = Some(match state.signal {
        Some(level) => {
            i18n::t(app, "system.wifi.connectedSignal").replace("{n}", &level.to_string())
        }
        None => i18n::t(app, "system.wifi.connected"),
    });
    alert.icon = Some("wifi".into());
    alert.color = Some(BLUE.into());
    alert.progress = state.signal.map(|level| level as f64 / 100.0);
    alert.priority = 100;
    alert.style = Style::Signal;
    alert.tone = Some("wifi".into());
    alert.expand = false;
    activities.upsert(alert);
}

fn show_disconnected(activities: &Activities, state: &WifiState) {
    let app = activities.app();
    let mut alert = Activity::alert(
        if state.searching {
            "system.wifi.searching"
        } else {
            "system.wifi.disconnected"
        },
        "wifi",
        Duration::from_secs(4),
    );
    alert.title = i18n::t(app, "system.wifi.title");
    alert.subtitle = Some(i18n::t(
        app,
        if state.searching {
            "system.wifi.searching"
        } else {
            "system.wifi.disconnected"
        },
    ));
    alert.icon = Some("wifi".into());
    alert.color = Some(RED.into());
    alert.priority = 100;
    alert.style = Style::Signal;
    alert.tone = Some(if state.searching { "scan" } else { "wifi-off" }.into());
    alert.expand = false;
    activities.upsert(alert);
}
