$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$herdPhp = Join-Path $env:USERPROFILE '.config\herd\bin\php85\php.exe'
Set-Location -LiteralPath $projectRoot
& $herdPhp artisan schedule:run --no-interaction >> (Join-Path $projectRoot 'storage\logs\scheduler.log') 2>&1
exit $LASTEXITCODE
