param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$agentRoot = Join-Path $projectRoot "vendor\DataAgent"
$pythonExe = "C:\Users\EDY\AppData\Local\Programs\Python\Python312\python.exe"

if (-not (Test-Path $pythonExe)) {
  $pythonExe = "python"
}

$apiPort = 18080
$uiPort = 18501
$apiHealthUrl = "http://127.0.0.1:$apiPort/openapi.json"
$uiHealthUrl = "http://127.0.0.1:$uiPort/"

function Test-PortListening {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return [bool]$listener
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$Attempts = 30,
    [int]$DelayMs = 1000
  )

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        return $true
      }
    } catch {
    }
    Start-Sleep -Milliseconds $DelayMs
  }
  return $false
}

if (-not (Test-Path $agentRoot)) {
  throw "DataAgent directory not found: $agentRoot"
}

if (-not (Test-Path (Join-Path $agentRoot "conf.yaml"))) {
  Copy-Item (Join-Path $agentRoot "conf.example.yaml") (Join-Path $agentRoot "conf.yaml") -Force
}

if (-not (Test-Path (Join-Path $projectRoot "logs"))) {
  New-Item -Path (Join-Path $projectRoot "logs") -ItemType Directory | Out-Null
}

$apiOutLog = Join-Path $projectRoot "logs\data-agent-api.out.log"
$apiErrLog = Join-Path $projectRoot "logs\data-agent-api.err.log"
$uiOutLog = Join-Path $projectRoot "logs\data-agent-ui.out.log"
$uiErrLog = Join-Path $projectRoot "logs\data-agent-ui.err.log"

if (-not (Test-PortListening -Port $apiPort)) {
  Start-Process -FilePath $pythonExe `
    -ArgumentList "server.py", "--host", "127.0.0.1", "--port", "$apiPort" `
    -WorkingDirectory $agentRoot `
    -RedirectStandardOutput $apiOutLog `
    -RedirectStandardError $apiErrLog | Out-Null
}

if (-not (Test-PortListening -Port $uiPort)) {
  Start-Process -FilePath $pythonExe `
    -ArgumentList "-m", "streamlit", "run", "streamlit_app.py", "--server.port", "$uiPort", "--server.address", "127.0.0.1", "--server.headless", "true" `
    -WorkingDirectory $agentRoot `
    -RedirectStandardOutput $uiOutLog `
    -RedirectStandardError $uiErrLog | Out-Null
}

$apiReady = Wait-HttpReady -Url $apiHealthUrl -Attempts 30 -DelayMs 800
$uiReady = Wait-HttpReady -Url $uiHealthUrl -Attempts 30 -DelayMs 800

Write-Host "DataAgent status:"
Write-Host "API: http://127.0.0.1:$apiPort"
Write-Host "UI : http://127.0.0.1:$uiPort"
Write-Host "API ready: $apiReady"
Write-Host "UI ready : $uiReady"
