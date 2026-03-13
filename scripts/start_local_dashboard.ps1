$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$port = 8888
$healthUrl = "http://127.0.0.1:$port/financial/health"
$dashUrl = "http://127.0.0.1:$port/financial/bi-dashboard"
$pythonExe = "C:\Users\EDY\AppData\Local\Programs\Python\Python312\python.exe"

if (-not (Test-Path $pythonExe)) {
  $pythonExe = "python"
}

$listening = netstat -ano |
  Select-String -SimpleMatch ":$port" |
  Select-String -SimpleMatch "LISTENING" |
  Select-Object -First 1
if (-not $listening) {
  if (-not (Test-Path "logs")) {
    New-Item -Path "logs" -ItemType Directory | Out-Null
  }

  $outLog = Join-Path $projectRoot "logs\dashboard.out.log"
  $errLog = Join-Path $projectRoot "logs\dashboard.err.log"

  Start-Process -FilePath $pythonExe `
    -ArgumentList "main.py" `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog | Out-Null
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if (-not $ready) {
  Write-Host "Dashboard service did not become ready."
  Write-Host "Check logs: $projectRoot\logs\dashboard.err.log"
  exit 1
}

Start-Process $dashUrl | Out-Null
Write-Host "Dashboard is ready:"
Write-Host "URL: $dashUrl"
Write-Host "Login: form-based"
Write-Host "Users file: $projectRoot\config\bi_dashboard_users.local.yaml"
