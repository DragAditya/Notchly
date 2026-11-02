# Changelog

All notable changes to Notchly are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
