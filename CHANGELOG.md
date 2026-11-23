# Changelog

All notable changes to Notchly are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.1] — 2026-11-23

### Fixed

- **The notch stays on top.** Opening or focusing a browser could leave the island behind the browser window until a foreground change raised it again. The window's extended style is rebuilt whenever the notch toggles click-through, and those rewrites dropped the topmost bit; the topmost state is now preserved across style changes, and the island keeps it even while a maximized or fullscreen app is in front (it only re-raises on foreground changes outside fullscreen, so games and videos are untouched).

## [1.3.0] — 2026-11-21

### Added

- Pop-out lyrics board: a dedicated window with **bar**, **mini** and **full** layouts that adapt to the window size, a karaoke-style active line that fills as it plays, and per-word highlighting when the lyrics source provides word timings.
- Smooth playback clock: a single shared frame loop drives live highlighting without re-rendering React on every tick, so the active line and progress rail stay fluid instead of lagging.
- Thumbnail-driven accent colours: the cover art's palette tints the board, scrubber and controls, so each track gets its own look.
- Online cover-art lookup: artwork for browser-played music is fetched from Deezer and iTunes and cached locally, with an automatic "browser logo" detector so real covers replace placeholder logos. A toggle in Settings turns the lookup off.
- Global media hotkeys: `Ctrl+Alt+Left` / `Ctrl+Alt+Right` skip tracks, `Ctrl+Alt+Up` / `Ctrl+Alt+Down` change the system volume, and `Ctrl+Alt+0` plays or pauses. All are dispatched on a worker thread and are editable in Advanced.
- More lyric sources and language support: lyrics.ovh, LRCLIB and **megalobiz** are queried together, results are ranked, and transliteration (including Hinglish) is preferred when available.

### Changed

- **Buttons above the progress bar.** The controls row now sits above the elapsed/rail/remaining scrubber, which gets a gradient accent fill, hover time bubble and optimistic drag/keyboard seeking.
- The backdrop is less blurred by default, with a new blur control in Settings.
- Compact music layouts hide cleanly and avoid empty space; resizing limits prevent broken layouts, and the mini active lyric is clamped to one line.

## [1.2.1] — 2026-11-07

### Added

- Notch lock: `Ctrl+Alt+L` freezes the island in its idle state and ignores hover, clicks, drags, peeks and global opens while keeping the notch visible. A locked click shakes the notch and flashes it red; the lock can also be made click-through so clicks reach the app below. The companion's eyes and reactions stay hidden while locked, and the lock can be toggled from the tray. A brief "Locked"/"Unlocked" label confirms each change. The shortcut can be changed or cleared in Advanced, and startup conflicts are reported there.
- Multi-provider lyrics: LRCLIB and lyrics.ovh are queried concurrently, English originals are preferred over other languages, and plain lyrics appear in the expanded music panel when no synced version exists. Lyrics are cached under `lyrics/v2`.

### Changed

- The notch lock is now absolute: music, notifications, required actions, peeks and global opens cannot expand the island while locked. Ambient module bubbles and the companion are hidden too.
- Repository layout now keeps the application source in `code/` and built EXE/installer artifacts in `release/`. `build.ps1` builds from `code/` and fills `release/` with the portable ZIP and checksums.

## [1.1.0] — 2026-11-02

### Added

- Large screenshot card in the notch with Keep and Delete actions.
- Deletion countdown and a separate card auto-close progress line.
- Pending screenshot section in the Shelf, with thumbnails, live countdowns and Keep/Delete actions.
- Pending screenshot cleanup that survives a restart.
- Configurable screenshot card width and height.

### Changed

- The second screenshot replaces the card and restarts the timer; older screenshots go to the pending Shelf.
- Hovering over the screenshot card no longer expands, collapses, pauses or otherwise changes it.
- Removed the small floating Keep/Delete bar.
- The application data directory is now `%APPDATA%\com.notchly.desktop`.
- Existing settings, Shelf contents and pending screenshot records migrate automatically from the previous directory.
- The About page now shows version, update controls and license information.

### Fixed

- Pending screenshot records are cleaned up when the clipboard module is disabled.
- Expired pending screenshots are removed from the Shelf on startup.

## [1.0.0] — 2026-10-29

The first public Notchly release.

### Added

- New Notchly identity, icon, application id, binary name (`notchly.exe`) and installers.
- New settings and shelf migration from the legacy Dynamic Island app-data folder.
- Ask Gemini module with a configurable API key, model selection, screenshots and attachments.
- Live lyrics in the music module.
- Music YouTube detection using browser window titles, with YouTube Music excluded.
- Windows power-mode watcher using `PowerGetActualOverlayScheme`.
- Brightness, volume, Bluetooth, charging and battery live activities with reliable expansion.
- `NOTCHLY_PORT` environment variable for the local API.
- Full documentation set: README, API reference, architecture notes, contributing guide, security policy and issue templates.
- GitHub Actions CI and a tagged release workflow.
- New branded visuals and application icon.

### Changed

- The island now closes an auto-peek when its activity becomes inactive, while manual peeks continue to work.
- Activity priorities use the newest event when several alerts compete.
- Music play/pause no longer re-expands the music panel.

### Fixed

- Volume, brightness, Bluetooth and power-mode alerts did not consistently expand the island.
- YouTube browser videos could compete with music auto-expand.
- The settings window and tray still used the old app name.
- Notifications package identity and manifest now match the Notchly package.

### License

GPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
