$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/DragAditya/Notchly/releases/download/v1.2.1/Notchly_1.2.1_x64-setup.exe'
  checksum64     = '6908d9eee967ad74720588056a7891579c315c427b57f5a93348ff06b1192f2c'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
}

Install-ChocolateyPackage @packageArgs
