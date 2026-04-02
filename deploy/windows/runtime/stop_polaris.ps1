param(
    [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "SilentlyContinue"

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

function Stop-ProcessByPidFile {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return
    }

    $pidValue = Get-Content $PidFile -Raw
    if ($pidValue -match "^\d+$") {
        $targetPid = [int]$pidValue
        $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
        }
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-ProcessesByExecutablePath {
    param([string]$ExecutablePath)

    $normalizedTarget = [System.IO.Path]::GetFullPath($ExecutablePath)
    Get-Process | Where-Object {
        $_.Path -and [System.IO.Path]::GetFullPath($_.Path) -eq $normalizedTarget
    } | ForEach-Object {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

function Stop-PortListenersForApp {
    param(
        [int[]]$Ports,
        [string]$AppRoot
    )

    foreach ($port in $Ports) {
        try {
            $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
            foreach ($listener in $listeners) {
                $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
                if (-not $proc) {
                    continue
                }

                $exePath = $proc.ExecutablePath
                if ($exePath -and $AppRoot -and $exePath.StartsWith($AppRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
                    continue
                }

                if ($proc.CommandLine -and $AppRoot -and $proc.CommandLine.StartsWith($AppRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {
        }
    }
}

$appPath = (Resolve-Path $AppDir).Path
$runtimeDir = Join-Path $appPath "runtime"
$dataRoot = Get-DataRoot -AppPath $appPath
$stateDir = Join-Path $dataRoot "runtime"

Stop-ProcessByPidFile -PidFile (Join-Path $stateDir "frontend.pid")
Stop-ProcessByPidFile -PidFile (Join-Path $stateDir "backend.pid")
Stop-ProcessByPidFile -PidFile (Join-Path $stateDir "after-sales-api.pid")
Stop-ProcessByPidFile -PidFile (Join-Path $stateDir "mysql.pid")
Stop-ProcessesByExecutablePath -ExecutablePath (Join-Path $runtimeDir "node\node.exe")
Stop-ProcessesByExecutablePath -ExecutablePath (Join-Path $appPath "backend\PolarisBackend\PolarisBackend.exe")
Stop-ProcessesByExecutablePath -ExecutablePath (Join-Path $runtimeDir "mysql\bin\mysqld.exe")
Stop-PortListenersForApp -Ports @(3000, 3210, 8888, 13306) -AppRoot $appPath
