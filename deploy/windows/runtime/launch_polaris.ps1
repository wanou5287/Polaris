param(
    [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

function Show-LaunchError {
    param(
        [string]$AppPath,
        [string]$Message,
        [string]$Details = ""
    )

    try {
        $dataRoot = Get-DataRoot -AppPath $AppPath
        $runtimeDir = Join-Path $dataRoot "runtime"
        New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
        $logPath = Join-Path $runtimeDir "startup-error.log"
        $content = @"
[$(Get-Date -Format s)] Polaris startup failed
$Message

$Details
"@
        Set-Content -Path $logPath -Value $content -Encoding utf8

        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        [System.Windows.Forms.MessageBox]::Show(
            "Polaris startup failed.`r`n`r`n$Message`r`n`r`nError log:`r`n$logPath",
            "Polaris",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch {
    }
}

function Get-DataRoot {
    param([string]$AppPath)

    $explicit = [System.Environment]::GetEnvironmentVariable("POLARIS_DATA_ROOT", "Process")
    if (-not $explicit) {
        $explicit = [System.Environment]::GetEnvironmentVariable("POLARIS_DATA_ROOT", "User")
    }
    if (-not $explicit) {
        $explicit = Join-Path $env:LOCALAPPDATA "PolarisData"
    }
    return $explicit
}

function Import-EnvFile {
    param([string]$Path)

    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
            continue
        }
        $pair = $trimmed.Split("=", 2)
        [System.Environment]::SetEnvironmentVariable($pair[0], $pair[1], "Process")
    }
}

function Wait-Port {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $client = New-Object Net.Sockets.TcpClient
            $iar = $client.BeginConnect($HostName, $Port, $null, $null)
            if ($iar.AsyncWaitHandle.WaitOne(1000, $false) -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        } catch {
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Get-ListeningProcessInfo {
    param([int]$Port)

    try {
        $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $connection) {
            return $null
        }

        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
        if (-not $proc) {
            return [pscustomobject]@{
                ProcessId = $connection.OwningProcess
                ExecutablePath = ""
                CommandLine = ""
            }
        }

        return [pscustomobject]@{
            ProcessId = $proc.ProcessId
            ExecutablePath = $proc.ExecutablePath
            CommandLine = $proc.CommandLine
        }
    } catch {
        return $null
    }
}

function Test-ProcessMatchesPath {
    param(
        [pscustomobject]$ProcessInfo,
        [string]$ExecutablePath,
        [string]$CommandContains = ""
    )

    if (-not $ProcessInfo) {
        return $false
    }

    $exeMatches = $false
    if ($ProcessInfo.ExecutablePath -and $ExecutablePath) {
        try {
            $exeMatches = [System.IO.Path]::GetFullPath($ProcessInfo.ExecutablePath) -eq [System.IO.Path]::GetFullPath($ExecutablePath)
        } catch {
            $exeMatches = $ProcessInfo.ExecutablePath -eq $ExecutablePath
        }
    }

    if (-not $CommandContains) {
        return $exeMatches
    }

    $commandMatches = $false
    if ($ProcessInfo.CommandLine) {
        $commandMatches = $ProcessInfo.CommandLine -like "*$CommandContains*"
    }
    return $exeMatches -and $commandMatches
}

function Read-LogTail {
    param(
        [string]$Path,
        [int]$Tail = 60
    )

    if (-not (Test-Path $Path)) {
        return ""
    }

    try {
        return (Get-Content -Path $Path -Tail $Tail -ErrorAction SilentlyContinue) -join "`n"
    } catch {
        return ""
    }
}

try {
    $appPath = (Resolve-Path $AppDir).Path
    $runtimeDir = Join-Path $appPath "runtime"
    $dataRoot = Get-DataRoot -AppPath $appPath
    $stateDir = Join-Path $dataRoot "runtime"
    $installScript = Join-Path $runtimeDir "scripts\install.ps1"
    $manifestPath = Join-Path $runtimeDir "bootstrap-manifest.json"
    $mysqlPidPath = Join-Path $stateDir "mysql.pid"
    $backendPidPath = Join-Path $stateDir "backend.pid"
    $frontendPidPath = Join-Path $stateDir "frontend.pid"
    $afterSalesPidPath = Join-Path $stateDir "after-sales-api.pid"

    & powershell.exe -ExecutionPolicy Bypass -File $installScript -AppDir $appPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Install initialization failed with exit code $LASTEXITCODE"
    }

    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $envPath = Join-Path $stateDir "app.env"
    if (-not (Test-Path $envPath)) {
        throw "Runtime environment file not found: $envPath"
    }

    Import-EnvFile -Path $envPath
    [System.Environment]::SetEnvironmentVariable("POLARIS_APP_HOME", $appPath, "Process")
    [System.Environment]::SetEnvironmentVariable("POLARIS_DATA_ROOT", $dataRoot, "Process")

    $mysqlPort = [int]$manifest.mysql.port
    $backendPort = [int]$manifest.backend.port
    $frontendPort = [int]$manifest.frontend.port
    $afterSalesEnabled = $manifest.after_sales -and $manifest.after_sales.enabled
    $afterSalesPort = 0
    if ($afterSalesEnabled) {
        $afterSalesPort = [int]$manifest.after_sales.api_port
    }

    $mysqldExe = Join-Path $runtimeDir "mysql\bin\mysqld.exe"
    $myIniPath = Join-Path $stateDir "mysql.my.ini"
    $backendExe = Join-Path $appPath "backend\PolarisBackend\PolarisBackend.exe"
    $frontendDir = Join-Path $appPath "frontend"
    $afterSalesDir = if ($afterSalesEnabled) { Join-Path $appPath $manifest.after_sales.root_dir } else { "" }
    $afterSalesApiEntry = if ($afterSalesEnabled) { Join-Path $appPath $manifest.after_sales.api_entry } else { "" }
    $nodeExe = Join-Path $runtimeDir "node\node.exe"
    $logsDir = Join-Path $dataRoot "logs"
    $backendOutLog = Join-Path $logsDir "backend.out.log"
    $backendErrLog = Join-Path $logsDir "backend.err.log"
    $frontendOutLog = Join-Path $logsDir "frontend.out.log"
    $frontendErrLog = Join-Path $logsDir "frontend.err.log"
    $afterSalesOutLog = Join-Path $logsDir "after-sales-api.out.log"
    $afterSalesErrLog = Join-Path $logsDir "after-sales-api.err.log"
    $publicHost = [System.Environment]::GetEnvironmentVariable("POLARIS_PUBLIC_HOST", "Process")

    if (-not $publicHost) {
        $publicHost = "127.0.0.1"
    }

    New-Item -ItemType Directory -Force -Path $logsDir, $stateDir | Out-Null

    if (-not (Wait-Port -HostName "127.0.0.1" -Port $mysqlPort -TimeoutSeconds 1)) {
        $mysqlProc = Start-Process -FilePath $mysqldExe -ArgumentList @("--defaults-file=$myIniPath", "--console") -WindowStyle Hidden -PassThru
        Set-Content -Path $mysqlPidPath -Value $mysqlProc.Id -Encoding ascii
        if (-not (Wait-Port -HostName "127.0.0.1" -Port $mysqlPort -TimeoutSeconds 20)) {
            throw "MySQL failed to start on port $mysqlPort"
        }
    }

    $backendListener = Get-ListeningProcessInfo -Port $backendPort
    if ($backendListener -and -not (Test-ProcessMatchesPath -ProcessInfo $backendListener -ExecutablePath $backendExe)) {
        throw "Backend port $backendPort is already occupied by another process (PID $($backendListener.ProcessId))."
    }
    if (-not $backendListener) {
        $backendProc = Start-Process -FilePath $backendExe -WorkingDirectory $appPath -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog
        Set-Content -Path $backendPidPath -Value $backendProc.Id -Encoding ascii
        if (-not (Wait-Port -HostName "127.0.0.1" -Port $backendPort -TimeoutSeconds 45)) {
            throw "Backend failed to start on port $backendPort`n$(Read-LogTail -Path $backendErrLog)"
        }
    }

    $afterSalesListener = $null
    if ($afterSalesEnabled) {
        $afterSalesListener = Get-ListeningProcessInfo -Port $afterSalesPort
        if ($afterSalesListener -and -not (Test-ProcessMatchesPath -ProcessInfo $afterSalesListener -ExecutablePath $nodeExe -CommandContains $afterSalesApiEntry)) {
            throw "After-sales API port $afterSalesPort is already occupied by another process (PID $($afterSalesListener.ProcessId))."
        }
    }
    if ($afterSalesEnabled -and -not $afterSalesListener) {
        $afterSalesProc = Start-Process -FilePath $nodeExe -ArgumentList @($afterSalesApiEntry) -WorkingDirectory $afterSalesDir -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $afterSalesOutLog -RedirectStandardError $afterSalesErrLog
        Set-Content -Path $afterSalesPidPath -Value $afterSalesProc.Id -Encoding ascii
        if (-not (Wait-Port -HostName "127.0.0.1" -Port $afterSalesPort -TimeoutSeconds 60)) {
            $afterSalesLogs = Read-LogTail -Path $afterSalesErrLog
            if (-not $afterSalesLogs) {
                $afterSalesLogs = Read-LogTail -Path $afterSalesOutLog
            }
            throw "After-sales API failed to start on port $afterSalesPort`n$afterSalesLogs"
        }
    }

    $frontendListener = Get-ListeningProcessInfo -Port $frontendPort
    if ($frontendListener -and -not (Test-ProcessMatchesPath -ProcessInfo $frontendListener -ExecutablePath $nodeExe -CommandContains "server.js")) {
        throw "Frontend port $frontendPort is already occupied by another process (PID $($frontendListener.ProcessId))."
    }
    if (-not $frontendListener) {
        [System.Environment]::SetEnvironmentVariable("POLARIS_API_BASE_URL", "http://127.0.0.1:$backendPort", "Process")
        [System.Environment]::SetEnvironmentVariable("PORT", "$frontendPort", "Process")
        [System.Environment]::SetEnvironmentVariable("HOSTNAME", "0.0.0.0", "Process")
        [System.Environment]::SetEnvironmentVariable("NODE_ENV", "production", "Process")
        $frontendProc = Start-Process -FilePath $nodeExe -ArgumentList @("server.js") -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $frontendOutLog -RedirectStandardError $frontendErrLog
        Set-Content -Path $frontendPidPath -Value $frontendProc.Id -Encoding ascii
        if (-not (Wait-Port -HostName "127.0.0.1" -Port $frontendPort -TimeoutSeconds 45)) {
            throw "Frontend failed to start on port $frontendPort`n$(Read-LogTail -Path $frontendErrLog)"
        }
    }

    Start-Process "http://127.0.0.1:$frontendPort/login" | Out-Null
    Write-Output "Local: http://127.0.0.1:$frontendPort/login"
    Write-Output "LAN: http://${publicHost}:$frontendPort/login"
    if ($afterSalesEnabled) {
        Write-Output "After-sales local entry: http://127.0.0.1:$frontendPort$($manifest.after_sales.public_entry_path)"
    }
    Write-Output "Data: $dataRoot"
} catch {
    $resolvedApp = $AppDir
    try {
        $resolvedApp = (Resolve-Path $AppDir).Path
    } catch {
    }
    Show-LaunchError -AppPath $resolvedApp -Message $_.Exception.Message -Details ($_.ScriptStackTrace + "`r`n" + $_.ToString())
    exit 1
}
