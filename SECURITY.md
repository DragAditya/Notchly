# Security Policy

## Supported versions

Security fixes are provided for the latest published Notchly release. If you are running an older build, update to the latest release before reporting an issue that may already be fixed.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected version, Windows version, reproduction steps and any relevant logs.

If private reporting is unavailable, contact the maintainer through the GitHub profile [DragAditya](https://github.com/DragAditya) and ask for a private channel. Do not include secrets or personal data in a public issue.

You can expect an initial response within a few days. Please allow time for a fix before public disclosure.

## Scope

In scope:

- The local HTTP API and its request validation
- Credential and secret handling
- Tauri command boundaries and local file access
- Notification, clipboard and screen-capture privacy
- Installer and update behavior
- Dependency vulnerabilities that affect the shipped app

Out of scope:

- Issues requiring physical access to an unlocked machine
- Vulnerabilities in third-party services (Google, Spotify, GitHub, Anthropic, YouTube)
- Windows itself or WebView2
- Social engineering

## Security design

- The local API binds to `127.0.0.1` only.
- API actions accept `https` links only; file and custom protocol links are rejected.
- Mirrored notification text is excluded from the local status endpoint.
- Settings and secrets are stored locally under the user profile.
- No telemetry or Notchly server is used.
- Release artifacts should be downloaded from this repository's Releases page and verified with `SHA256SUMS.txt`.

## Secrets

Never commit API keys, GitHub tokens, signing keys or `.env` files. If a secret is committed, revoke it immediately and report the exposure privately.
