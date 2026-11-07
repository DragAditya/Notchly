$ErrorActionPreference = 'Stop'

Get-Process notchly -ErrorAction SilentlyContinue | Stop-Process -Force
