# Notchly Architecture

Notchly is a Windows desktop app built with Tauri 2. The Rust process owns the native windows, Windows integrations and local persistence. A React renderer owns the island UI and settings UI, and the two communicate over Tauri commands and events.

## Process model

```
┌────────────────────────────────────────────────────────────┐
│ Tauri / Rust                                               │
│                                                            │
│  window.rs      island overlay, hit testing, input         │
│  display.rs     monitor selection, placement, fullscreen   │
│  tray.rs        tray menu, hide/show, autostart            │
│  settings.rs    local JSON settings + migration            │
│  providers/     provider registry and Windows integrations │
│  hub            shared state broadcast to the webview      │
└──────────────────────────┬─────────────────────────────────┘
                           │ Tauri IPC / events
┌──────────────────────────┴─────────────────────────────────┐
│ React renderer                                             │
│                                                            │
│  core/          bridge, types, settings, appearance, i18n  │
│  modules/       music, ask, agents, activities, ...        │
│  settings/      settings window                            │
│  pip/           pinned video window                        │
└────────────────────────────────────────────────────────────┘
```

## Provider registry

Each Windows integration is a provider in `src-tauri/src/providers/`. A provider starts on its own thread, publishes snapshots through the `Hub`, and can receive actions from the UI.

Examples:

| Provider | Responsibility |
|---|---|
| `music` | Windows SMTC sessions, artwork, controls, YouTube detection, lyrics |
| `ask` | Gemini API requests, screenshots and attachments |
| `claude` | Transcripts, hooks, permissions, plan usage and statusline bridge |
| `activities` | Volume, brightness, Bluetooth, battery, power mode and the local API |
| `notifications` | WinRT notification listener and sparse package registration |
| `github` | Authenticated or anonymous issue counts |
| `monitor` | CPU, memory, GPU and network counters through PDH |
| `find` | Screen capture, Windows OCR and click-through highlight overlay |
| `clipboard` / `shelf` | Clipboard history and file references |

Providers must degrade gracefully when a Windows API is unavailable. A missing media player, for example, must not prevent the island from starting.

## Windows integration notes

- **Music:** Windows System Media Transport Controls (`Windows.Media.Control`). Browser videos are detected from the window title; YouTube Music is excluded from the video treatment.
- **Notifications:** `UserNotificationListener` requires package identity. Notchly registers an unsigned sparse package with Windows and uses a matching `<msix>` entry in its application manifest.
- **Power mode:** `PowerGetActualOverlayScheme` reports the active Windows power overlay, including Balanced, Best performance and Best efficiency.
- **OCR:** Windows `OcrEngine` reads tiled screen captures, keeping text in memory for the duration of a search.
- **Monitoring:** Performance Data Helper (PDH) counters mirror Task Manager's CPU, memory, GPU and network measurements.
- **Window overlay:** The island uses a transparent, always-on-top, click-through window. `window.rs` dynamically updates the hit-test rectangle as the visible island changes.

## Persistence

- Settings: `%APPDATA%\com.dragaditya.notchly\settings.json`
- Shelf: `%APPDATA%\com.dragaditya.notchly\shelf.json`
- On first run, Notchly copies settings and shelf data from the legacy `com.heyyczer.dynamicisland` folder when it is present.
- Secrets such as the Gemini API key live in the local settings file and are never sent to Notchly maintainers.
- GitHub tokens can use the operating system credential store when configured that way.

## IPC boundaries

- The renderer cannot arbitrarily read files. Features that need native access expose narrow Tauri commands.
- The local HTTP API is bound to `127.0.0.1` and validates colors, links and payload sizes.
- Notification text is excluded from `/status` so unrelated local apps cannot read private messages.

## Frontend structure

- `src/core/bridge.ts` provides typed access to Tauri commands and event snapshots.
- Each module owns its UI, settings definitions and state.
- `src/locales` contains English and Portuguese (Brazil); the key list is generated at build time.
- `src/settings` is a separate React entry point rendered in a normal window.

## Release pipeline

GitHub Actions builds tagged releases on Windows:

1. Install Bun and Rust.
2. Build the frontend.
3. Build the Tauri app and installers.
4. Upload NSIS, MSI and portable artifacts.
5. Publish a GitHub Release.

The app's updater endpoint points at `DragAditya/Notchly` releases. Signing keys are supplied through repository secrets and are not committed.
