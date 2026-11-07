$ErrorActionPreference = 'Stop'

$uninstaller = Join-Path $env:LOCALAPPDATA 'Notchly\uninstall.exe'
if (Test-Path $uninstaller) {
  Uninstall-ChocolateyPackage -PackageName $env:ChocolateyPackageName -FileType 'exe' -SilentArgs '/S' -File $uninstaller
}
