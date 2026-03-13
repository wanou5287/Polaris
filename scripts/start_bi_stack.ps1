$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$mysqlPort = 3306
$dashboardPort = 8888
$mysqlExe = "C:\mysql-8.4.8-winx64\bin\mysqld.exe"
$mysqlDefaultsFile = "C:\mysql-8.4.8-winx64\my.ini"
$dashboardHealthUrl = "http://127.0.0.1:$dashboardPort/financial/health"
$remoteLog = Join-Path $projectRoot "logs\cloudflared.err.log"
$remotePattern = 'https://[-a-z0-9]+\.trycloudflare\.com'

function Test-PortListening {
  param([int]$Port)

  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return [bool]$listener
}

function Wait-HttpHealthy {
  param(
    [string]$Url,
    [int]$Attempts = 30,
    [int]$DelayMs = 1000
  )

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($resp.StatusCode -eq 200) {
        return $true
      }
    } catch {
    }
    Start-Sleep -Milliseconds $DelayMs
  }

  return $false
}

function Get-CurrentTunnelUrl {
  param([string]$LogFile)

  if (-not (Test-Path $LogFile)) {
    return $null
  }

  $match = Select-String -Path $LogFile -Pattern $remotePattern -AllMatches -ErrorAction SilentlyContinue
  if (-not $match) {
    return $null
  }

  return $match.Matches[-1].Value
}

Write-Host "[1/3] Checking MySQL..."
if (-not (Test-PortListening -Port $mysqlPort)) {
  if (-not (Test-Path $mysqlExe)) {
    throw "MySQL executable not found: $mysqlExe"
  }
  if (-not (Test-Path $mysqlDefaultsFile)) {
    throw "MySQL config not found: $mysqlDefaultsFile"
  }

  Start-Process -FilePath $mysqlExe `
    -ArgumentList "--defaults-file=$mysqlDefaultsFile" `
    -WorkingDirectory (Split-Path -Parent $mysqlExe) `
    | Out-Null

  $mysqlReady = $false
  for ($i = 0; $i -lt 20; $i++) {
    if (Test-PortListening -Port $mysqlPort) {
      $mysqlReady = $true
      break
    }
    Start-Sleep -Seconds 1
  }

  if (-not $mysqlReady) {
    throw "MySQL did not start on 127.0.0.1:$mysqlPort"
  }
}
Write-Host "MySQL ready: 127.0.0.1:$mysqlPort"

Write-Host "[2/3] Starting local dashboard..."
& (Join-Path $scriptDir "start_local_dashboard.ps1")

if (-not (Wait-HttpHealthy -Url $dashboardHealthUrl -Attempts 15 -DelayMs 500)) {
  throw "Dashboard health check failed: $dashboardHealthUrl"
}

Write-Host "[3/3] Starting remote access..."
& (Join-Path $scriptDir "start_remote_access.ps1")

$publicUrl = Get-CurrentTunnelUrl -LogFile $remoteLog
Write-Host ""
Write-Host "Startup complete:"
Write-Host "Local URL: http://127.0.0.1:$dashboardPort/financial/bi-dashboard"
if ($publicUrl) {
  Write-Host "Public URL: $publicUrl/financial/bi-dashboard"
}
Write-Host "Login: form-based"
Write-Host "Users file: $projectRoot\config\bi_dashboard_users.local.yaml"
