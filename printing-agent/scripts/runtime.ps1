function Get-CompatibleNodeRuntime {
    param([string]$NodePath)
    if (!$NodePath -or !(Test-Path -LiteralPath $NodePath -PathType Leaf)) { return $null }
    $npmCli = Join-Path (Split-Path -Parent $NodePath) 'node_modules\npm\bin\npm-cli.js'
    if (!(Test-Path -LiteralPath $npmCli -PathType Leaf)) { return $null }
    try {
        $version = [string](& $NodePath --version 2>$null)
        if ($LASTEXITCODE -eq 0 -and $version.Trim() -match '^v(?<version>\d+\.\d+\.\d+)$' -and [version]$Matches.version -ge [version]'26.13.0') {
            return [PSCustomObject]@{ node = $NodePath; npm = $npmCli; version = $version.Trim() }
        }
    } catch { }
    return $null
}

function Get-NodeRelease {
    param([string]$Checksums, [ValidateSet('x64','arm64')][string]$Architecture)
    foreach ($line in ($Checksums -split '\r?\n')) {
        if ($line.Trim() -match ('^(?<hash>[a-fA-F0-9]{64})\s+(?<file>node-v(?<version>26\.\d+\.\d+)-win-' + $Architecture + '\.zip)$') -and [version]$Matches.version -ge [version]'26.13.0') {
            return [PSCustomObject]@{ hash = $Matches.hash; file = $Matches.file; version = ('v' + $Matches.version) }
        }
    }
    throw 'No se encontro una descarga oficial compatible de Node.js 26 LTS.'
}

function Assert-NodeArchive {
    param([string]$Path, [string]$ExpectedHash)
    $stream = [System.IO.File]::OpenRead($Path)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { $actual = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '') }
    finally { $stream.Dispose(); $hasher.Dispose() }
    if ($actual -ine $ExpectedHash) { throw 'La descarga de Node.js no coincide con su SHA256 oficial. No se ejecutara.' }
}

function Expand-NodeArchive {
    param([string]$ArchivePath, [string]$Destination)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $Destination)
}

function Initialize-NodeRuntime {
    param([string]$AgentHome, [AllowEmptyString()][string]$NodeCandidate = ((Get-Command node -ErrorAction SilentlyContinue).Source))
    $existing = Get-CompatibleNodeRuntime -NodePath $NodeCandidate
    if ($existing) { return $existing }
    $runtimeFile = Join-Path $AgentHome 'runtime.json'
    if (Test-Path -LiteralPath $runtimeFile) {
        try {
            $saved = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
            $existing = Get-CompatibleNodeRuntime -NodePath $saved.node
            if ($existing) { return $existing }
        } catch { }
    }
    Write-Host 'No se encontro Node.js compatible. Instalando Node.js 26 LTS para este agente...'
    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $architecture = switch ($architecture) { 'AMD64' { 'x64' }; 'ARM64' { 'arm64' }; default { throw 'El agente necesita Windows de 64 bits (x64 o ARM64).' } }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/latest-v26.x/SHASUMS256.txt' -TimeoutSec 30).Content
    if ($checksums -is [byte[]]) { $checksums = [System.Text.Encoding]::UTF8.GetString($checksums) }
    $release = Get-NodeRelease -Checksums $checksums -Architecture $architecture
    $staging = Join-Path $AgentHome ('downloads\' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    $archive = Join-Path $staging $release.file
    Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/' + $release.version + '/' + $release.file) -OutFile $archive -TimeoutSec 180
    Assert-NodeArchive -Path $archive -ExpectedHash $release.hash
    $runtimeRoot = Join-Path $AgentHome ('runtime\' + $release.version + '-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    Expand-NodeArchive -ArchivePath $archive -Destination $runtimeRoot
    $node = Join-Path $runtimeRoot ($release.file.Substring(0, $release.file.Length - 4) + '\node.exe')
    $runtime = Get-CompatibleNodeRuntime -NodePath $node
    if (!$runtime) { throw 'La instalacion local de Node.js no pudo verificarse.' }
    return $runtime
}

function Get-AgentLauncher {
    param([string]$AppDirectory)
    return @{
        executable = Join-Path $env:SystemRoot 'System32\wscript.exe'
        arguments = '//B //NoLogo "' + (Join-Path $AppDirectory 'Iniciar.vbs') + '"'
    }
}

function Register-AgentStartup {
    param([string]$AppDirectory, [string]$RegistryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run')
    $launcher = Get-AgentLauncher -AppDirectory $AppDirectory
    $command = '"' + $launcher.executable + '" ' + $launcher.arguments
    if ($command.Length -gt 260) { throw 'La ruta de instalacion es demasiado larga para el inicio automatico de Windows.' }
    if (!(Test-Path -LiteralPath $RegistryPath)) { New-Item -Path $RegistryPath -Force | Out-Null }
    New-ItemProperty -LiteralPath $RegistryPath -Name 'LotoEnlacePrintAgent' -Value $command -PropertyType String -Force | Out-Null
    return $command
}
