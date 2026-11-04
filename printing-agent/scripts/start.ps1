param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
if ([System.Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    $arguments = '-NoLogo -NoProfile -NonInteractive -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
    if ($ValidateOnly) { $arguments += ' -ValidateOnly' }
    Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden
    exit 0
}
& (Join-Path $PSScriptRoot 'tray.ps1') -ValidateOnly:$ValidateOnly
