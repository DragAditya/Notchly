# Packaging

Package-manager definitions for Notchly.

- `winget/` — manifest for `DragAditya.Notchly`. The current submission is
  [microsoft/winget-pkgs#474260](https://github.com/microsoft/winget-pkgs/pull/474260).
  The Microsoft CLA is signed and all validation checks pass; it is waiting for
  a moderator to merge.
- `scoop/notchly.json` — manifest mirrored in the
  [DragAditya/scoop-notchly](https://github.com/DragAditya/scoop-notchly) bucket.
  The official Extras bucket has a popularity threshold, so the self-hosted
  bucket is the immediate install path.
- `chocolatey/notchly/` — Chocolatey package definition. `notchly 1.2.1` has
  been pushed to the community repository and is awaiting moderation.

Keep the version, installer URL, and SHA-256 hashes in sync with each GitHub
release. The release's `SHA256SUMS.txt` is the source of truth. Do not re-run
the release workflow after generating these manifests: a re-run rebuilds the
installers and changes their hashes.
