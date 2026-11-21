$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/DragAditya/Notchly/releases/download/v1.3.0/Notchly_1.3.0_x64-setup.exe'
  checksum64     = 'e1c141f70172c3cb816658e50f0e8ff67710af1fa25153eb2f2d6b0526badade'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
}

Install-ChocolateyPackage @packageArgs
