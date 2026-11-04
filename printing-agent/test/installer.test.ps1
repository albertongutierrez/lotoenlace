param([string]$Scenario, [string]$Scratch, [string]$RuntimeScript)
$ErrorActionPreference = 'Stop'
. $RuntimeScript
function Assert($condition, $message) { if (!$condition) { throw $message } }

switch ($Scenario) {
    'parse' {
        Get-ChildItem -LiteralPath (Split-Path -Parent $RuntimeScript) -Filter '*.ps1' | ForEach-Object {
            $tokens = $null; $errors = $null
            [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null
            Assert ($errors.Count -eq 0) ('Sintaxis incorrecta: ' + $_.Name)
        }
    }
    'release' {
        $hash = 'a' * 64
        $manifest = "$hash  node-v26.13.0-win-x64.zip`r`n$hash  node-v26.13.0-win-arm64.zip"
        foreach ($architecture in @('x64','arm64')) {
            $release = Get-NodeRelease -Checksums $manifest -Architecture $architecture
            Assert ($release.file -eq "node-v26.13.0-win-$architecture.zip") 'Arquitectura incorrecta'
        }
        $rejected = $false
        try { Get-NodeRelease -Checksums 'untrusted.exe' -Architecture x64 | Out-Null } catch { $rejected = $true }
        Assert $rejected 'Se acepto un nombre de descarga no valido'
    }
    'existing' {
        function Get-CompatibleNodeRuntime { param($NodePath); if ($NodePath -eq 'compatible') { return @{ node = 'compatible'; npm = 'npm-cli'; version = 'v26.13.0' } } }
        function Invoke-WebRequest { throw 'No debe descargar Node.js si ya es compatible' }
        $result = Initialize-NodeRuntime -AgentHome $Scratch -NodeCandidate 'compatible'
        Assert ($result.node -eq 'compatible') 'No reutilizo Node.js'
    }
    { $_ -in 'install','bad-hash' } {
        $script:expanded = $false
        $script:requested = @()
        $archiveContent = [System.Text.Encoding]::UTF8.GetBytes('downloaded-runtime-fixture')
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        try { $script:checksum = ([BitConverter]::ToString($hasher.ComputeHash($archiveContent))).Replace('-', '').ToLowerInvariant() } finally { $hasher.Dispose() }
        if ($Scenario -eq 'bad-hash') { $script:checksum = '0' * 64 }
        function Get-CompatibleNodeRuntime {
            param($NodePath)
            if ($script:expanded -and $NodePath -like '*\node.exe') { return @{ node = $NodePath; npm = 'npm-cli'; version = 'v26.13.0' } }
            return $null
        }
        function Invoke-WebRequest {
            param($Uri, $OutFile, [switch]$UseBasicParsing, $TimeoutSec)
            $script:requested += $Uri
            if ($OutFile) { [System.IO.File]::WriteAllBytes($OutFile, [System.Text.Encoding]::UTF8.GetBytes('downloaded-runtime-fixture')); return }
            return @{ Content = "$script:checksum  node-v26.13.0-win-x64.zip" }
        }
        function Expand-NodeArchive { param($ArchivePath, $Destination); $script:expanded = $true }
        $env:PROCESSOR_ARCHITEW6432 = 'AMD64'
        $failed = $false
        try {
            $result = Initialize-NodeRuntime -AgentHome $Scratch -NodeCandidate ''
            Assert ($result.node -like '*node-v26.13.0-win-x64\node.exe') 'Ruta de instalacion incorrecta'
        } catch {
            if ($Scenario -ne 'bad-hash') { throw }
            Assert ($_.Exception.Message -like '*SHA256*') 'Fallo por un motivo distinto al hash'
            $failed = $true
        }
        if ($Scenario -eq 'bad-hash') { Assert $failed 'No rechazo el hash'; Assert (!$script:expanded) 'Extrajo el archivo antes de verificarlo' }
        else {
            Assert $script:expanded 'No instalo Node.js'
            Assert ($script:requested[0] -eq 'https://nodejs.org/dist/latest-v26.x/SHASUMS256.txt') 'Origen del manifiesto incorrecto'
            Assert ($script:requested[1] -eq 'https://nodejs.org/dist/v26.13.0/node-v26.13.0-win-x64.zip') 'La descarga no pertenece a la version verificada'
        }
    }
    'startup' {
        # Mock registry cmdlets: the test never writes a real Windows startup entry.
        $script:writes = @()
        function Test-Path { param($LiteralPath); return $true }
        function New-ItemProperty {
            param($LiteralPath, $Name, $Value, $PropertyType, [switch]$Force)
            $script:writes += @{ path = $LiteralPath; name = $Name; value = $Value; force = [bool]$Force }
        }
        $first = Register-AgentStartup -AppDirectory 'C:\Users\Test User\Agent'
        $second = Register-AgentStartup -AppDirectory 'C:\Users\Test User\Agent'
        Assert ($first -eq $second) 'Reinstalar altero el registro de inicio'
        Assert ($script:writes.Count -eq 2) 'No registro el inicio'
        Assert ($script:writes[0].name -eq 'LotoEnlacePrintAgent') 'Nombre de inicio incorrecto'
        Assert ($script:writes[0].path -eq 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run') 'El inicio no pertenece al usuario'
        Assert ($first.Contains('\wscript.exe" //B //NoLogo ')) 'El inicio no usa el lanzador sin consola'
        Assert ($first.EndsWith('"C:\Users\Test User\Agent\Iniciar.vbs"')) 'No protege los espacios de la ruta'
        Assert ($script:writes[0].force) 'Reinstalar duplicaria el inicio'
    }
    default { throw 'Escenario de prueba no valido' }
}
Write-Output ('OK: ' + $Scenario)
