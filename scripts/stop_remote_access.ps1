$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$pidFile = Join-Path $projectRoot ".tmp\cloudflared.pid"

if (-not (Test-Path $pidFile)) {
  Write-Output "No remote tunnel pid file found."
  exit 0
}

$targetPid = Get-Content $pidFile -ErrorAction SilentlyContinue
if ($targetPid -and (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) {
  Stop-Process -Id $targetPid -Force
  Write-Output "Stopped remote tunnel process $targetPid."
} else {
  Write-Output "Remote tunnel process was not running."
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
