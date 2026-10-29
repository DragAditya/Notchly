# Contributing to Notchly

Thanks for helping improve Notchly. This project is a native Windows app, so changes should be tested on Windows and should keep the UI responsive when a Windows API is slow or unavailable.

## Before you start

- Search existing issues and pull requests first.
- For a larger feature, open an issue describing the problem and the proposed approach before writing a lot of code.
- For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
- By contributing, you agree that your contribution is licensed under GPL-3.0-or-later.

## Development setup

Prerequisites:

- Windows 10/11
- [Bun](https://bun.sh) 1.3+ (or npm)
- [Rust](https://rustup.rs) with the MSVC toolchain
- Visual Studio Build Tools with Desktop development with C++

```sh
git clone https://github.com/DragAditya/Notchly.git
cd Notchly
bun install
bun run app:dev
```

Frontend-only preview with mock data:

```sh
bun run dev
```

## Checks

Run these before opening a pull request:

```sh
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

If your change touches Windows integration code, also run the app and exercise the affected feature manually. Include what you tested in the PR description.

## Code guidelines

- Keep Rust providers independent: one provider failing must not take down the island.
- Do not block the UI thread with network calls, OCR or filesystem scans.
- Prefer existing provider and settings patterns over new global state.
- Keep user-visible strings in `src/locales/en.json5` and add the same keys to other locales.
- Do not add telemetry, analytics or a Notchly-hosted service.
- Do not commit API keys, tokens, signing keys, `node_modules`, `dist` or `src-tauri/target`.

## Commit and PR style

- Use a short imperative commit subject, for example `fix: keep music compact after pause`.
- Keep unrelated changes out of the same PR.
- Describe the user-visible effect, the implementation, and the tests you ran.
- Link the issue the PR addresses.
- Include a screenshot or short recording for UI changes.

## Adding a language

Copy `src/locales/en.json5` to `src/locales/<code>.json5`, translate the values, and set the language name. The build regenerates the typed key list. Test the tray and settings window in that language.

## Release changes

Do not bump versions or create tags in a feature PR unless the maintainer asks. Releases are cut by the maintainer from `main`.

## Code of conduct

Be direct, technical and respectful. Harassment, personal attacks and discriminatory behavior are not welcome. Maintainers may close or remove contributions that violate these expectations.
