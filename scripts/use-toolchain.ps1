param([string]$PhpExecutable)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $project '.tooling'
$nodeVersion = (Get-Content -LiteralPath (Join-Path $project '.node-version') -Raw).Trim()
$npmVersion = '12.2.1'
$composerVersion = '2.11.1'

if (!$PhpExecutable) {
    $herdPhp = Join-Path $env:USERPROFILE '.config\herd\bin\php85\php.exe'
    $PhpExecutable = if (Test-Path -LiteralPath $herdPhp -PathType Leaf) { $herdPhp } else { (Get-Command php.exe).Source }
}
$PhpExecutable = (Resolve-Path -LiteralPath $PhpExecutable).Path
$phpVersionId = & $PhpExecutable -r 'echo PHP_VERSION_ID;'
if ($LASTEXITCODE -ne 0 -or [int]$phpVersionId -lt 80512 -or [int]$phpVersionId -ge 80600) {
    throw 'LotoEnlace requiere PHP 8.5.12 o un parche posterior de PHP 8.5.'
}

$cpu = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$arch = switch ($cpu) { 'AMD64' { 'x64' }; 'ARM64' { 'arm64' }; default { throw 'Se requiere Windows x64 o ARM64.' } }
$nodeName = "node-v$nodeVersion-win-$arch"
$nodeDir = Join-Path $toolsDir $nodeName
$nodeExe = Join-Path $nodeDir 'node.exe'
New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null

function Get-VerifiedDownload([string]$Url, [string]$Destination, [string]$Sha256) {
    if ($Sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'El servidor no devolvio un SHA256 valido.' }
    $partial = $Destination + '.part'
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $partial -TimeoutSec 180
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ine $Sha256) { throw "SHA256 incorrecto: $Url" }
    Move-Item -LiteralPath $partial -Destination $Destination -Force
}

if (!(Test-Path -LiteralPath $nodeExe -PathType Leaf)) {
    $nodeUrl = "https://nodejs.org/dist/v$nodeVersion"
    $zipName = "$nodeName.zip"
    $manifest = (Invoke-WebRequest -UseBasicParsing -Uri "$nodeUrl/SHASUMS256.txt" -TimeoutSec 30).Content
    if ($manifest -is [byte[]]) { $manifest = [Text.Encoding]::UTF8.GetString($manifest) }
    $entry = [regex]::Match($manifest, '(?m)^(?<sha>[0-9a-fA-F]{64})\s+' + [regex]::Escape($zipName) + '\r?$')
    $archive = Join-Path $toolsDir $zipName
    Get-VerifiedDownload "$nodeUrl/$zipName" $archive $entry.Groups['sha'].Value
    Expand-Archive -LiteralPath $archive -DestinationPath $toolsDir -Force
}
if ((& $nodeExe --version) -ne "v$nodeVersion") { throw 'La version de Node.js instalada no coincide.' }

$prefix = @($toolsDir, $nodeDir, (Split-Path -Parent $PhpExecutable))
$env:Path = (@($prefix) + @($env:Path -split ';' | Where-Object { $_ -and $_ -notin $prefix })) -join ';'
$npmCli = Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js'
if ((& $nodeExe $npmCli --version) -ne $npmVersion) {
    & $nodeExe $npmCli install --global --prefix $nodeDir "npm@$npmVersion" --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0 -or (& $nodeExe $npmCli --version) -ne $npmVersion) { throw 'No se pudo preparar npm.' }
}

$composerFile = "composer-$composerVersion.phar"
$composerPath = Join-Path $toolsDir $composerFile
if (!(Test-Path -LiteralPath $composerPath -PathType Leaf)) {
    $composerUrl = "https://getcomposer.org/download/$composerVersion/composer.phar"
    $checksum = (Invoke-WebRequest -UseBasicParsing -Uri "$composerUrl.sha256sum" -TimeoutSec 30).Content
    if ($checksum -is [byte[]]) { $checksum = [Text.Encoding]::UTF8.GetString($checksum) }
    Get-VerifiedDownload $composerUrl $composerPath ($checksum.Trim() -split '\s+')[0]
}
$shim = '@echo off' + "`r`n" + 'php.exe "%~dp0' + $composerFile + '" %*' + "`r`n"
$shimPath = Join-Path $toolsDir 'composer.cmd'
if (!(Test-Path -LiteralPath $shimPath -PathType Leaf) -or [IO.File]::ReadAllText($shimPath) -cne $shim) {
    [IO.File]::WriteAllText($shimPath, $shim, [Text.Encoding]::ASCII)
}
Write-Host "LotoEnlace: PHP $(& $PhpExecutable -r 'echo PHP_VERSION;'), Node $nodeVersion, npm $npmVersion, Composer $composerVersion."
