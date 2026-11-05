# Releasing Notchly

Releases are built from a version tag on `main` by `.github/workflows/release.yml`.

## One-time setup

1. Generate a Tauri updater signing key:
   ```powershell
   bun tauri signer generate -w "$env:USERPROFILE\.tauri\notchly.key"
   ```
2. Put the **public** key in `code/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
3. Add the **private** key as the repository secret `TAURI_SIGNING_PRIVATE_KEY`.
4. Keep a secure backup of the private key. Losing it means existing installs cannot verify future updates.

The private key must never be committed or pasted into an issue.

## Cut a release

1. Update `CHANGELOG.md`.
2. Bump the version from the source folder:
   ```powershell
   cd code
   bun run v patch
   ```
   This updates `code/package.json`, `code/src-tauri/Cargo.toml`, `code/src-tauri/Cargo.lock`, and stages the Cargo files.
3. Commit the version bump and push `main`.
4. Push the tag:
   ```powershell
   git push --follow-tags
   ```
5. The release workflow builds NSIS, MSI, updater artifacts, the portable ZIP and `SHA256SUMS.txt`, then publishes the GitHub Release.

## Manual local build

From the repository root:

```powershell
.\build.ps1          # unsigned, fastest
.\build.ps1 -Signed  # requires TAURI_SIGNING_PRIVATE_KEY
```

`build.ps1` builds from `code/` and copies the EXE, installers, portable ZIP and `SHA256SUMS.txt` into `release/`. To run the raw Tauri build yourself:

```powershell
cd code
bun run app:build          # unsigned
bun run app:build:signed   # requires TAURI_SIGNING_PRIVATE_KEY
```

The raw installers land in `code/src-tauri/target/release/bundle/`.

## Portable build

The portable ZIP contains `notchly.exe` and an empty `.portable` marker. The marker disables self-update and first-run autostart registration. `.\build.ps1` creates it automatically. To build it by hand from the repository root:

```powershell
$version = (Get-Content code/package.json | ConvertFrom-Json).version
$dir = "release/Notchly"
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item code/src-tauri/target/release/notchly.exe $dir
New-Item -ItemType File "$dir/.portable" | Out-Null
Compress-Archive -Path $dir -DestinationPath "release/Notchly_${version}_x64-portable.zip"
```

Publish `SHA256SUMS.txt` alongside every binary asset.
