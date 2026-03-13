$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$cloudflaredExe = Join-Path $projectRoot ".tmp\cloudflared.exe"
$dashboardUrl = "http://127.0.0.1:8888"
$healthUrl = "$dashboardUrl/financial/health"
$outLog = Join-Path $projectRoot "logs\cloudflared.out.log"
$errLog = Join-Path $projectRoot "logs\cloudflared.err.log"
$pidFile = Join-Path $projectRoot ".tmp\cloudflared.pid"
$tunnelArgs = "tunnel --url $dashboardUrl --protocol http2 --no-autoupdate"

if (-not (Test-Path $cloudflaredExe)) {
  throw "cloudflared.exe not found: $cloudflaredExe"
}

try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
  if ($resp.StatusCode -ne 200) {
    throw "dashboard health check failed"
  }
} catch {
  throw "Dashboard is not ready on $dashboardUrl . Start main.py first."
}

if (-not (Test-Path "logs")) {
  New-Item -Path "logs" -ItemType Directory | Out-Null
}

if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    Write-Output "Remote tunnel already running. PID: $existingPid"
  } else {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path $pidFile)) {
  if (Test-Path $outLog) { Remove-Item $outLog -Force }
  if (Test-Path $errLog) { Remove-Item $errLog -Force }

  $proc = Start-Process `
    -FilePath $cloudflaredExe `
    -ArgumentList $tunnelArgs `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

  Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii
}

$publicUrl = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 750
  if (Test-Path $outLog) {
    $match = Select-String -Path $outLog -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue
    if ($match) {
      $publicUrl = $match.Matches[-1].Value
      break
    }
  }
  if (Test-Path $errLog) {
    $match = Select-String -Path $errLog -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue
    if ($match) {
      $publicUrl = $match.Matches[-1].Value
      break
    }
  }
}

if (-not $publicUrl) {
  Write-Output "Tunnel process started, but public URL was not captured yet."
  Write-Output "Check logs:"
  Write-Output $outLog
  Write-Output $errLog
  exit 1
}

Write-Output "Remote access is ready:"
Write-Output "Public URL: $publicUrl"
Write-Output "Dashboard login: form-based"
Write-Output "Users file: $projectRoot\\config\\bi_dashboard_users.local.yaml"
