param(
    [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

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

function Wait-ServiceDeleted {
    param(
        [string]$Name,
        [int]$TimeoutSeconds = 15
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
        if (-not $svc) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

$appPath = (Resolve-Path $AppDir).Path
$dataRoot = Get-DataRoot -AppPath $appPath
$stateDir = Join-Path $dataRoot "runtime"
$statusPath = Join-Path $stateDir "cloudflare-tunnel.json"
$serviceName = "PolarisCloudflared"

if (Test-Path $statusPath) {
    $status = Get-Content -Path $statusPath -Raw | ConvertFrom-Json
    if ($status.service_name) {
        $serviceName = [string]$status.service_name
    }
}

try {
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
} catch {
}

& sc.exe delete $serviceName | Out-Null
if (-not (Wait-ServiceDeleted -Name $serviceName -TimeoutSeconds 20)) {
    throw "Cloudflare tunnel service $serviceName could not be removed cleanly."
}

Get-ChildItem -Path $stateDir -Filter "cloudflare-tunnel*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $stateDir "public-url.txt") -Force -ErrorAction SilentlyContinue

Write-Output "Cloudflare tunnel service removed: $serviceName"
