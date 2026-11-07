# Code signing policy

Notchly signs its Windows release artifacts. This policy explains what is
signed, how it is built, and who approves signing requests.

## Status

Notchly has applied to the [SignPath Foundation](https://signpath.org/) for free
code signing for open-source projects. Until the application is approved,
Windows builds are unsigned and SmartScreen may show a warning.

## What will be signed

- `Notchly_<version>_x64-setup.exe` — NSIS installer
- `Notchly_<version>_x64_en-US.msi` — MSI installer
- The stable aliases `Notchly_x64-setup.exe` and `Notchly_x64.msi`

Only artifacts built by the public GitHub Actions release workflow from this
repository will be signed.

## Build and signing process

- Builds run in GitHub Actions from the public repository.
- Tauri v2 builds the NSIS installer and MSI.
- After approval, the artifacts will be submitted to SignPath for Authenticode
  signing.
- The private key is held by SignPath in an HSM. The project does not store the
  private key.
- The Tauri updater `.sig` files are separate from the Authenticode signature
  and are generated with the project's updater key.

## Team roles

Single-maintainer project:

- **Author:** [DragAditya](https://github.com/DragAditya)
- **Reviewer:** [DragAditya](https://github.com/DragAditya)
- **Approver:** [DragAditya](https://github.com/DragAditya)

All external pull requests are reviewed before merge. Each signing request
requires explicit approval by the maintainer.

## Distribution

- GitHub Releases: <https://github.com/DragAditya/Notchly/releases>
- Scoop bucket: <https://github.com/DragAditya/scoop-notchly>
- winget: submission pending
- Chocolatey: submission pending moderation

## Verification

- Every release includes `SHA256SUMS.txt`.
- Download only from the official GitHub Releases page or the package managers
  listed above.
- Once signing is active, release notes will state: “Free code signing provided
  by SignPath.io, certificate by SignPath Foundation.”

## Contact

Open an issue at <https://github.com/DragAditya/Notchly/issues>.
