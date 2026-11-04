param([string]$AppUrl = 'http://lotoenlace.test')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$source = Split-Path -Parent $PSScriptRoot
$agentHome = if ($env:LOTOENLACE_AGENT_HOME) { $env:LOTOENLACE_AGENT_HOME } else { Join-Path $env:LOCALAPPDATA 'LotoEnlace\PrintAgent' }
$destination = Join-Path $agentHome 'app'
. (Join-Path $PSScriptRoot 'runtime.ps1')
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$runtime = Initialize-NodeRuntime -AgentHome $agentHome
$node = $runtime.node
$npmCli = $runtime.npm
$runtimeJson = @{ node = $node; version = $runtime.version } | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $agentHome 'runtime.json'), $runtimeJson, [System.Text.UTF8Encoding]::new($false))
if ([System.IO.Path]::GetFullPath($source).TrimEnd('\') -ine [System.IO.Path]::GetFullPath($destination).TrimEnd('\')) {
    foreach ($name in @('package.json','package-lock.json','README.md','Iniciar.bat','Iniciar.vbs','Instalar.bat')) { Copy-Item -LiteralPath (Join-Path $source $name) -Destination $destination -Force }
    foreach ($name in @('src','scripts')) { Copy-Item -LiteralPath (Join-Path $source $name) -Destination $destination -Recurse -Force }
}
$previousPath = $env:Path
$env:Path = (Split-Path -Parent $node) + ';' + $env:Path
Push-Location $destination
try {
    & $node $npmCli ci --omit=dev --ignore-scripts --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=2
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias del agente.' }
    $null = & $node 'src/cli.mjs' configure "--app-url=$AppUrl"
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo vincular el agente con el sistema.' }
} finally { Pop-Location; $env:Path = $previousPath }
Register-AgentStartup -AppDirectory $destination | Out-Null
$launcher = Get-AgentLauncher -AppDirectory $destination
Start-Process -FilePath $launcher.executable -ArgumentList $launcher.arguments -WorkingDirectory $destination -WindowStyle Hidden
Write-Host 'Instalado. El agente iniciara automaticamente al entrar a Windows con este usuario.'
Write-Host 'Copia la clave desde el icono de LotoEnlace en la bandeja y pegala en Ventas > Impresora.'
