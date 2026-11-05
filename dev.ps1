$ErrorActionPreference = "Stop"

$code = Join-Path $PSScriptRoot "code"

if (-not (Test-Path (Join-Path $code "package.json"))) {
    throw "Source folder not found: $code"
}

if (-not (Test-Path (Join-Path $code "node_modules"))) {
    Push-Location $code
    try {
        Write-Host "Installing dependencies..."
        bun install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "bun install failed" }
    }
    finally {
        Pop-Location
    }
}

Push-Location $code
try {
    bun run app:dev
    if ($LASTEXITCODE -ne 0) { throw "dev command failed" }
}
finally {
    Pop-Location
}
