$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/DragAditya/Notchly/releases/download/v1.2.1/Notchly_1.2.1_x64-setup.exe'
  checksum64     = 'b864d43d6a4534c9f3482f51fc2efad8cf22a6f7cba8b09bf52be606a7f40089'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
}

Install-ChocolateyPackage @packageArgs
