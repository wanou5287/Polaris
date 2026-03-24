$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "[1/3] Stopping remote access..."
& (Join-Path $scriptDir "stop_remote_access.ps1")

Write-Host "[2/3] Stopping local dashboard..."
& (Join-Path $scriptDir "stop_local_dashboard.ps1")

Write-Host "[3/3] Stopping data analysis agent..."
& (Join-Path $scriptDir "stop_data_agent.ps1")

Write-Host "Stopped web, data analysis agent and remote tunnel. MySQL is still running."
