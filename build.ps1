[CmdletBinding()]
param(
    [switch]$Signed,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = $PSScriptRoot
$code = Join-Path $root "code"
$release = Join-Path $root "release"

if (-not (Test-Path (Join-Path $code "package.json"))) {
    throw "Source folder not found: $code"
}

Push-Location $code
try {
    if (-not $SkipInstall -and -not (Test-Path "node_modules")) {
        Write-Host "Installing dependencies..."
        bun install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "bun install failed" }
    }

    $task = if ($Signed) { "app:build:signed" } else { "app:build:local" }
    Write-Host "Building Notchly ($task)..."
    bun run $task
    if ($LASTEXITCODE -ne 0) { throw "build failed" }

    $version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
    $target = Join-Path $code "src-tauri\target\release"
    $setup = Get-ChildItem (Join-Path $target "bundle\nsis\*.exe") -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $msi = Get-ChildItem (Join-Path $target "bundle\msi\*.msi") -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $exe = Join-Path $target "notchly.exe"

    if (-not $setup -or -not $msi -or -not (Test-Path $exe)) {
        throw "Build outputs are missing under $target"
    }

    New-Item -ItemType Directory -Path $release -Force | Out-Null
    Get-ChildItem $release -File -Filter "Notchly_*" -ErrorAction SilentlyContinue |
        Remove-Item -Force

    Copy-Item $setup.FullName (Join-Path $release $setup.Name) -Force
    Copy-Item $msi.FullName (Join-Path $release $msi.Name) -Force

    $portable = Join-Path $release "Notchly"
    if (Test-Path $portable) { Remove-Item $portable -Recurse -Force }
    New-Item -ItemType Directory -Path $portable -Force | Out-Null
    Copy-Item $exe (Join-Path $portable "notchly.exe")
    New-Item -ItemType File (Join-Path $portable ".portable") -Force | Out-Null
    Copy-Item (Join-Path $root "LICENSE") $portable
    Copy-Item (Join-Path $root "NOTICE.md") $portable

    $zip = Join-Path $release "Notchly_${version}_x64-portable.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $portable -DestinationPath $zip

    $files = @(
        (Join-Path $portable "notchly.exe"),
        (Join-Path $release $setup.Name),
        (Join-Path $release $msi.Name),
        $zip
    )
    $lines = $files | ForEach-Object {
        $hash = (Get-FileHash $_ -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $(Split-Path $_ -Leaf)"
    }
    $lines | Set-Content (Join-Path $release "SHA256SUMS.txt") -Encoding ascii

    Write-Host ""
    Write-Host "Release files in $release"
    Get-ChildItem $release -File | Select-Object Name, Length | Format-Table -AutoSize
}
finally {
    Pop-Location
}
