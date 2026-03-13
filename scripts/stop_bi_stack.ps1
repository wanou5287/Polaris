$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "[1/2] Stopping remote access..."
& (Join-Path $scriptDir "stop_remote_access.ps1")

Write-Host "[2/2] Stopping local dashboard..."
& (Join-Path $scriptDir "stop_local_dashboard.ps1")

Write-Host "Stopped web and remote tunnel. MySQL is still running."
