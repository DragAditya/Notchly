# Releasing Notchly

Releases are built from a version tag on `main` by `.github/workflows/release.yml`.

## One-time setup

1. Generate a Tauri updater signing key:
   ```powershell
   bun tauri signer generate -w "$env:USERPROFILE\.tauri\notchly.key"
   ```
2. Put the **public** key in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
3. Add the **private** key as the repository secret `TAURI_SIGNING_PRIVATE_KEY`.
4. Keep a secure backup of the private key. Losing it means existing installs cannot verify future updates.

The private key must never be committed or pasted into an issue.

## Cut a release

1. Update `CHANGELOG.md`.
2. Bump the version:
   ```powershell
   bun run v patch
   ```
   This updates `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and stages the Cargo files.
3. Commit the version bump and push `main`.
4. Push the tag:
   ```powershell
   git push --follow-tags
   ```
5. The release workflow builds NSIS, MSI, updater artifacts, the portable ZIP and `SHA256SUMS.txt`, then publishes the GitHub Release.

## Manual local build

```powershell
bun run app:build          # unsigned, fastest
bun run app:build:signed   # requires TAURI_SIGNING_PRIVATE_KEY
```

Installers land in `src-tauri/target/release/bundle/`.

## Portable build

The portable ZIP contains `notchly.exe` and an empty `.portable` marker. The marker disables self-update and first-run autostart registration. Create it with:

```powershell
$version = (Get-Content package.json | ConvertFrom-Json).version
$dir = "portable/Notchly"
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item src-tauri/target/release/notchly.exe $dir
New-Item -ItemType File "$dir/.portable" | Out-Null
Compress-Archive -Path $dir -DestinationPath "Notchly_${version}_x64-portable.zip"
```

Publish `SHA256SUMS.txt` alongside every binary asset.
