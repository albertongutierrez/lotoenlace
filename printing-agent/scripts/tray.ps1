param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http
[System.Windows.Forms.Application]::EnableVisualStyles()
$appDirectory = Split-Path -Parent $PSScriptRoot
$agentHome = if ($env:LOTOENLACE_AGENT_HOME) { $env:LOTOENLACE_AGENT_HOME } else { Join-Path $env:LOCALAPPDATA 'LotoEnlace\PrintAgent' }
if ($ValidateOnly -and !$env:LOTOENLACE_AGENT_HOME) { $agentHome = Join-Path ([System.IO.Path]::GetTempPath()) ('LotoEnlace-TrayValidation-' + [Guid]::NewGuid().ToString('N')) }
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutexName = 'Local\LotoEnlace.PrintAgent.' + $identity
if ($ValidateOnly) { $mutexName += '.Validation.' + $PID }
$mutex = [System.Threading.Mutex]::new($false, $mutexName)
$ownsMutex = $false
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class LotoEnlaceIconHandle { [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle); }'
$script:TrayState = @{ Process = $null; Health = $null; HealthTask = $null; ControlTask = $null; Client = $null; Config = $null; Runtime = $null; Status = 'starting'; Detail = 'Consultando el agente'; NextProbe = [DateTime]::MinValue; InitialProbe = $true; PortConflict = $false; PendingRestart = $false; RestartAfter = [DateTime]::MinValue; DesiredRunning = $true; StartedAt = [DateTime]::MinValue; LastLog = ''; Window = $null; HealthText = $null }

function New-PrinterTrayIcon([System.Drawing.Color]$BadgeColor) {
    $bitmap = [System.Drawing.Bitmap]::new(32, 32)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(51, 65, 85), 2)
    $badge = [System.Drawing.SolidBrush]::new($BadgeColor)
    try {
        $graphics.SmoothingMode = 'AntiAlias'
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.FillRectangle([System.Drawing.Brushes]::WhiteSmoke, 5, 12, 22, 14)
        $graphics.DrawRectangle($pen, 5, 12, 22, 14)
        $graphics.FillRectangle([System.Drawing.Brushes]::White, 9, 3, 14, 12)
        $graphics.DrawRectangle($pen, 9, 3, 14, 12)
        $graphics.FillRectangle([System.Drawing.Brushes]::White, 10, 20, 12, 10)
        $graphics.DrawRectangle($pen, 10, 20, 12, 10)
        $graphics.FillEllipse($badge, 20, 20, 12, 12)
        $handle = $bitmap.GetHicon()
        try { return [System.Drawing.Icon]::FromHandle($handle).Clone() }
        finally { [LotoEnlaceIconHandle]::DestroyIcon($handle) | Out-Null }
    } finally { $graphics.Dispose(); $pen.Dispose(); $badge.Dispose(); $bitmap.Dispose() }
}

function Write-TrayStatus([string]$Status, [string]$Detail) {
    $script:TrayState.Status = $Status
    $script:TrayState.Detail = $Detail
    $fingerprint = $Status + ':' + $Detail
    if ($script:TrayState.LastLog -ne $fingerprint) {
        $script:TrayState.LastLog = $fingerprint
        try {
            New-Item -ItemType Directory -Path $agentHome -Force | Out-Null
            $line = (Get-Date -Format o) + ' [' + $Status + '] ' + $Detail + [Environment]::NewLine
            [System.IO.File]::AppendAllText((Join-Path $agentHome 'startup.log'), $line, [System.Text.UTF8Encoding]::new($false))
            if ($Status -eq 'error') { [System.IO.File]::AppendAllText((Join-Path $agentHome 'startup-error.log'), $line, [System.Text.UTF8Encoding]::new($false)) }
        } catch { [Console]::Error.WriteLine('No se pudo escribir el diagnostico local del agente.') }
    }
    $snapshot = [ordered]@{ status = $Status; detail = $Detail; updated_at = (Get-Date -Format o); tray_pid = $PID; service_pid = $script:TrayState.Health.pid; version = $script:TrayState.Health.version; busy = [bool]$script:TrayState.Health.busy }
    try { [System.IO.File]::WriteAllText((Join-Path $agentHome 'tray-status.json'), ($snapshot | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false)) } catch { }
    $labels = @{ running = 'En ejecucion'; starting = 'Iniciando'; stopped = 'Detenido'; stopping = 'Deteniendo'; error = 'Error' }
    $label = $labels[$Status]
    $script:StatusItem.Text = 'Estado: ' + $label
    $script:Notify.Text = 'LotoEnlace - Impresion: ' + $label
    $script:Notify.Icon = switch ($Status) { 'running' { $script:GreenIcon }; 'error' { $script:RedIcon }; 'starting' { $script:AmberIcon }; 'stopping' { $script:AmberIcon }; default { $script:GrayIcon } }
    $available = $script:TrayState.Client -ne $null -and $script:TrayState.Runtime -ne $null
    $script:StartItem.Enabled = $available -and $Status -in @('stopped','error')
    $script:StopItem.Enabled = $Status -eq 'running' -and [bool]$script:TrayState.Health.controls
    $script:RestartItem.Enabled = $available -and $Status -notin @('starting','stopping')
    if ($script:TrayState.HealthText -and !$script:TrayState.HealthText.IsDisposed) { $script:TrayState.HealthText.Text = Get-HealthSummary }
}

function Get-HealthSummary {
    $summary = [ordered]@{ estado = $script:TrayState.Status; detalle = $script:TrayState.Detail; endpoint = 'http://127.0.0.1:18745/health'; consulta = (Get-Date -Format o); health = $script:TrayState.Health; logs = $agentHome }
    return $summary | ConvertTo-Json -Depth 5
}

function Show-HealthWindow {
    if ($script:TrayState.Window -and !$script:TrayState.Window.IsDisposed) { $script:TrayState.Window.Activate(); return }
    $form = [System.Windows.Forms.Form]::new()
    $form.Text = 'LotoEnlace - Estado del servicio de impresion'
    $form.Size = [System.Drawing.Size]::new(680, 480)
    $form.MinimumSize = [System.Drawing.Size]::new(520, 360)
    $form.StartPosition = 'CenterScreen'
    $form.Icon = $script:GreenIcon
    $text = [System.Windows.Forms.TextBox]::new()
    $text.Multiline = $true; $text.ReadOnly = $true; $text.ScrollBars = 'Both'; $text.Dock = 'Fill'
    $text.Font = [System.Drawing.Font]::new('Consolas', 10)
    $text.Text = Get-HealthSummary
    $refresh = [System.Windows.Forms.Button]::new()
    $refresh.Text = 'Actualizar health'; $refresh.Dock = 'Bottom'; $refresh.Height = 36
    $refresh.Add_Click({ $script:TrayState.NextProbe = [DateTime]::MinValue })
    $form.Controls.Add($text); $form.Controls.Add($refresh)
    $script:TrayState.Window = $form; $script:TrayState.HealthText = $text
    $form.Show()
}

function Start-LocalAgent {
    if (!$script:TrayState.Runtime) { [System.Windows.Forms.MessageBox]::Show('Vuelve a ejecutar Instalar.bat: falta configurar Node.js.', 'LotoEnlace') | Out-Null; return }
    if ($script:TrayState.Process -and !$script:TrayState.Process.HasExited) { return }
    if ($script:TrayState.PortConflict) {
        $script:TrayState.DesiredRunning = $true
        $script:TrayState.InitialProbe = $true
        $script:TrayState.NextProbe = [DateTime]::MinValue
        return
    }
    try {
        $script:TrayState.DesiredRunning = $true
        $script:TrayState.StartedAt = [DateTime]::UtcNow
        $script:TrayState.Process = Start-Process -FilePath $script:TrayState.Runtime.node -ArgumentList ('"' + (Join-Path $appDirectory 'src\cli.mjs') + '" start') -WorkingDirectory $appDirectory -NoNewWindow -RedirectStandardOutput (Join-Path $agentHome 'agent.log') -RedirectStandardError (Join-Path $agentHome 'agent-error.log') -PassThru
        Write-TrayStatus 'starting' 'Esperando respuesta de Node.js'
        $script:TrayState.NextProbe = [DateTime]::MinValue
    } catch { Write-TrayStatus 'error' ('NODE_LAUNCH: Windows no pudo ejecutar Node.js (' + $_.Exception.GetType().Name + '). Ejecuta Instalar.bat.') }
}

function Stop-LocalAgent([bool]$Restart) {
    if (!$script:TrayState.Client) { return }
    if (!$script:TrayState.Health -or !$script:TrayState.Health.controls) {
        if ($Restart -and $script:TrayState.Status -ne 'running') { Start-LocalAgent; return }
        [System.Windows.Forms.MessageBox]::Show('Esta instancia no admite controles. Actualiza el agente con Instalar.bat.', 'LotoEnlace') | Out-Null
        return
    }
    if ($script:TrayState.ControlTask) { return }
    $script:TrayState.PendingRestart = $Restart
    $script:TrayState.DesiredRunning = $false
    $content = [System.Net.Http.StringContent]::new('{}', [System.Text.Encoding]::UTF8, 'application/json')
    $script:TrayState.ControlTask = $script:TrayState.Client.PostAsync('control/stop', $content)
    Write-TrayStatus 'stopping' $(if ($Restart) { 'Reiniciando el servicio' } else { 'Deteniendo el servicio' })
}

function Poll-Agent {
    try {
        if ($script:TrayState.ControlTask -and $script:TrayState.ControlTask.IsCompleted) {
            $task = $script:TrayState.ControlTask; $script:TrayState.ControlTask = $null
            try {
                $response = $task.GetAwaiter().GetResult()
                try {
                    if (!$response.IsSuccessStatusCode) { throw 'CONTROL_REJECTED' }
                    $script:TrayState.RestartAfter = [DateTime]::UtcNow.AddSeconds(1)
                } finally { $response.Dispose() }
            } catch {
                $script:TrayState.PendingRestart = $false
                $script:TrayState.DesiredRunning = $true
                [System.Windows.Forms.MessageBox]::Show('No se pudo detener el servicio. Puede haber una impresion en curso. Consulta Health y los logs.', 'LotoEnlace') | Out-Null
            }
            $script:TrayState.NextProbe = [DateTime]::MinValue
        }
        if ($script:TrayState.HealthTask -and $script:TrayState.HealthTask.IsCompleted) {
            $task = $script:TrayState.HealthTask; $script:TrayState.HealthTask = $null
            $healthy = $false
            $portResponded = $false
            try {
                $response = $task.GetAwaiter().GetResult()
                $portResponded = $true
                try {
                    if (!$response.IsSuccessStatusCode) { throw 'HEALTH_HTTP' }
                    $health = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
                    if ($health.service -ne 'LotoEnlace Print Agent' -or $health.device_id -ne $script:TrayState.Config.deviceId -or $health.issuer -ne $script:TrayState.Config.issuer) { throw 'HEALTH_IDENTITY' }
                    $script:TrayState.Health = $health | Select-Object service, version, status, pid, busy, controls, device_id, issuer
                    $healthy = $true
                } finally { $response.Dispose() }
            } catch { $script:TrayState.Health = $null }
            $script:TrayState.PortConflict = $portResponded -and !$healthy
            if ($healthy) {
                $script:TrayState.InitialProbe = $false
                if ($health.status -eq 'stopping' -or $script:TrayState.ControlTask) { Write-TrayStatus 'stopping' 'Esperando que termine el servicio' }
                else { Write-TrayStatus 'running' $(if ($health.busy) { 'Procesando una impresion' } else { 'Health correcto; listo para imprimir' }) }
            } elseif ($script:TrayState.PortConflict) {
                Write-TrayStatus 'error' 'PORT_IN_USE: el puerto 18745 responde, pero no se pudo identificar el agente configurado. Cierra la instancia anterior y vuelve a iniciar el servicio.'
            } elseif ($script:TrayState.InitialProbe) {
                $script:TrayState.InitialProbe = $false
                Start-LocalAgent
            } elseif ($script:TrayState.PendingRestart -and !$script:TrayState.ControlTask -and [DateTime]::UtcNow -ge $script:TrayState.RestartAfter) {
                if (!$script:TrayState.Process -or $script:TrayState.Process.HasExited) { $script:TrayState.PendingRestart = $false; Start-LocalAgent }
            } elseif (!$script:TrayState.DesiredRunning) { Write-TrayStatus 'stopped' 'Detenido por el usuario' }
            elseif ($script:TrayState.Process -and !$script:TrayState.Process.HasExited -and ([DateTime]::UtcNow - $script:TrayState.StartedAt).TotalSeconds -lt 10) { Write-TrayStatus 'starting' 'Esperando respuesta de Node.js' }
            else {
                $detail = 'HEALTH_UNAVAILABLE: el agente no responde. Abre agent-error.log o reinicia el servicio.'
                if ($script:TrayState.Process -and $script:TrayState.Process.HasExited) {
                    $exitCode = $script:TrayState.Process.ExitCode
                    $detail = if ($null -eq $exitCode) { 'NODE_EXIT: Node.js termino. Abre agent-error.log.' }
                        else { 'NODE_EXIT: Node.js termino con codigo ' + $exitCode + '. Abre agent-error.log.' }
                }
                Write-TrayStatus 'error' $detail
            }
            $script:TrayState.NextProbe = [DateTime]::UtcNow.AddSeconds($(if ($script:TrayState.Status -in @('starting','stopping')) { 1 } else { 5 }))
        }
        if ($script:TrayState.Client -and !$script:TrayState.HealthTask -and [DateTime]::UtcNow -ge $script:TrayState.NextProbe) { $script:TrayState.HealthTask = $script:TrayState.Client.GetAsync('health') }
    } catch { Write-TrayStatus 'error' ('TRAY_POLL: no se pudo actualizar el estado (' + $_.Exception.GetType().Name + ').') }
}

function Open-AgentLog([string]$Name) {
    $path = Join-Path $agentHome $Name
    if (!(Test-Path -LiteralPath $path)) { [System.IO.File]::WriteAllText($path, '') }
    Start-Process -FilePath 'notepad.exe' -ArgumentList ('"' + $path + '"')
}

try {
    try { $ownsMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (!$ownsMutex) { exit 0 }
    $script:GreenIcon = New-PrinterTrayIcon ([System.Drawing.Color]::FromArgb(16, 185, 129))
    $script:AmberIcon = New-PrinterTrayIcon ([System.Drawing.Color]::FromArgb(245, 158, 11))
    $script:RedIcon = New-PrinterTrayIcon ([System.Drawing.Color]::FromArgb(239, 68, 68))
    $script:GrayIcon = New-PrinterTrayIcon ([System.Drawing.Color]::FromArgb(100, 116, 139))
    $menu = [System.Windows.Forms.ContextMenuStrip]::new()
    $script:StatusItem = [System.Windows.Forms.ToolStripMenuItem]::new('Estado: Iniciando'); $script:StatusItem.Enabled = $false
    $script:StartItem = [System.Windows.Forms.ToolStripMenuItem]::new('Iniciar servicio')
    $script:StopItem = [System.Windows.Forms.ToolStripMenuItem]::new('Detener servicio')
    $script:RestartItem = [System.Windows.Forms.ToolStripMenuItem]::new('Reiniciar servicio')
    $healthItem = [System.Windows.Forms.ToolStripMenuItem]::new('Estado / Health')
    $logItem = [System.Windows.Forms.ToolStripMenuItem]::new('Ver log del agente')
    $errorItem = [System.Windows.Forms.ToolStripMenuItem]::new('Ver errores del agente')
    $startupItem = [System.Windows.Forms.ToolStripMenuItem]::new('Ver diagnostico de inicio')
    $folderItem = [System.Windows.Forms.ToolStripMenuItem]::new('Abrir carpeta de logs')
    $copyItem = [System.Windows.Forms.ToolStripMenuItem]::new('Copiar clave de conexion')
    $exitItem = [System.Windows.Forms.ToolStripMenuItem]::new('Cerrar solo el icono')
    $menu.Items.AddRange([System.Windows.Forms.ToolStripItem[]]@($script:StatusItem, [System.Windows.Forms.ToolStripSeparator]::new(), $script:StartItem, $script:StopItem, $script:RestartItem, $healthItem, [System.Windows.Forms.ToolStripSeparator]::new(), $logItem, $errorItem, $startupItem, $folderItem, $copyItem, [System.Windows.Forms.ToolStripSeparator]::new(), $exitItem))
    $script:Notify = [System.Windows.Forms.NotifyIcon]::new()
    $script:Notify.Icon = $script:GrayIcon; $script:Notify.Text = 'LotoEnlace - Impresion'; $script:Notify.ContextMenuStrip = $menu
    $script:StartItem.Add_Click({ Start-LocalAgent })
    $script:StopItem.Add_Click({ Stop-LocalAgent $false })
    $script:RestartItem.Add_Click({ Stop-LocalAgent $true })
    $healthItem.Add_Click({ Show-HealthWindow })
    $script:Notify.Add_DoubleClick({ Show-HealthWindow })
    $logItem.Add_Click({ Open-AgentLog 'agent.log' })
    $errorItem.Add_Click({ Open-AgentLog 'agent-error.log' })
    $startupItem.Add_Click({ Open-AgentLog 'startup.log' })
    $folderItem.Add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $agentHome + '"') })
    $copyItem.Add_Click({ if ($script:TrayState.Config) { [System.Windows.Forms.Clipboard]::SetText($script:TrayState.Config.token); $script:Notify.ShowBalloonTip(2000, 'LotoEnlace', 'Clave local copiada al portapapeles.', 'Info') } })
    $exitItem.Add_Click({ [System.Windows.Forms.Application]::ExitThread() })
    if ($ValidateOnly) {
        if ($menu.Items.Count -lt 10) { throw 'TRAY_MENU' }
        foreach ($caption in @('Iniciar servicio','Detener servicio','Reiniciar servicio','Estado / Health','Ver log del agente','Ver errores del agente')) {
            if (!@($menu.Items | Where-Object { $_.Text -eq $caption }).Count) { throw 'TRAY_MENU_ITEM' }
        }
        $script:TrayState.Client = [System.Net.Http.HttpClient]::new()
        $script:TrayState.Runtime = @{ node = 'not-executed-in-validation' }
        $script:TrayState.Config = @{ token = 'SECRET_MUST_NOT_APPEAR' }
        $script:TrayState.Health = [PSCustomObject]@{ controls = $true; busy = $false; pid = 1; version = 'test' }
        Write-TrayStatus 'running' 'Health de prueba'
        if ($script:StartItem.Enabled -or !$script:StopItem.Enabled) { throw 'TRAY_RUNNING_BUTTONS' }
        Write-TrayStatus 'stopped' 'Detenido de prueba'
        if (!$script:StartItem.Enabled -or $script:StopItem.Enabled) { throw 'TRAY_STOPPED_BUTTONS' }
        if ((Get-HealthSummary).Contains('SECRET_MUST_NOT_APPEAR')) { throw 'TRAY_SECRET_LEAK' }
        $probe = [System.Threading.Tasks.TaskCompletionSource[System.Net.Http.HttpResponseMessage]]::new()
        $probe.SetResult([System.Net.Http.HttpResponseMessage]::new([System.Net.HttpStatusCode]::Unauthorized))
        $script:TrayState.HealthTask = $probe.Task
        Poll-Agent
        if ($script:TrayState.Detail -notlike 'PORT_IN_USE:*' -or $script:TrayState.Process) { throw 'TRAY_PORT_CONFLICT' }
        Write-Output 'OK: tray-ui'
        exit 0
    }
    $script:Notify.Visible = $true
    $stage = 'CONFIG_READ'
    try {
        $script:TrayState.Config = Get-Content -LiteralPath (Join-Path $agentHome 'config.json') -Raw | ConvertFrom-Json
        if (!$script:TrayState.Config.token -or !$script:TrayState.Config.deviceId -or !$script:TrayState.Config.issuer) { throw 'CONFIG_FIELDS' }
        $stage = 'RUNTIME_READ'
        $script:TrayState.Runtime = Get-Content -LiteralPath (Join-Path $agentHome 'runtime.json') -Raw | ConvertFrom-Json
        if (!(Test-Path -LiteralPath $script:TrayState.Runtime.node -PathType Leaf)) { throw 'NODE_MISSING' }
        $stage = 'APP_FILES'
        if (!(Test-Path -LiteralPath (Join-Path $appDirectory 'src\cli.mjs'))) { throw 'CLI_MISSING' }
        $handler = [System.Net.Http.HttpClientHandler]::new(); $handler.UseProxy = $false
        $script:TrayState.Client = [System.Net.Http.HttpClient]::new($handler)
        $script:TrayState.Client.BaseAddress = [Uri]'http://127.0.0.1:18745/'
        $script:TrayState.Client.Timeout = [TimeSpan]::FromSeconds(2)
        $script:TrayState.Client.DefaultRequestHeaders.Add('Origin', ([Uri]$script:TrayState.Config.issuer).GetLeftPart([System.UriPartial]::Authority))
        $script:TrayState.Client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $script:TrayState.Config.token)
        Write-TrayStatus 'starting' 'Comprobando el servicio local'
    } catch { Write-TrayStatus 'error' ($stage + ': revisa la instalacion y su configuracion (' + $_.Exception.GetType().Name + '). Ejecuta Instalar.bat.') }
    $timer = [System.Windows.Forms.Timer]::new(); $timer.Interval = 500
    $timer.Add_Tick({ Poll-Agent }); $timer.Start()
    [System.Windows.Forms.Application]::Run()
} catch {
    try { New-Item -ItemType Directory -Path $agentHome -Force | Out-Null; [System.IO.File]::AppendAllText((Join-Path $agentHome 'startup-error.log'), ((Get-Date -Format o) + ' [TRAY_INIT] ' + $_.Exception.GetType().Name + [Environment]::NewLine)) } catch { }
    exit 1
} finally {
    if ($timer) { $timer.Stop(); $timer.Dispose() }
    if ($script:Notify) { $script:Notify.Visible = $false; $script:Notify.Dispose() }
    if ($script:TrayState.Window) { $script:TrayState.Window.Dispose() }
    if ($script:TrayState.Client) { $script:TrayState.Client.Dispose() }
    foreach ($icon in @($script:GreenIcon, $script:AmberIcon, $script:RedIcon, $script:GrayIcon)) { if ($icon) { $icon.Dispose() } }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
