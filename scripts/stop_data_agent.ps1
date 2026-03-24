$ErrorActionPreference = "Stop"

function Stop-PortProcess {
  param([int]$Port)

  $line = netstat -ano |
    Select-String -SimpleMatch ":$Port" |
    Select-String -SimpleMatch "LISTENING" |
    Select-Object -First 1

  if (-not $line) {
    Write-Host "No process is listening on port $Port."
    return
  }

  $tokens = ($line.ToString() -replace "\s+", " ").Trim().Split(" ")
  $targetPid = $tokens[-1]

  if (-not ($targetPid -match "^\d+$")) {
    Write-Host "Could not parse PID from netstat output: $line"
    return
  }

  taskkill /PID $targetPid /F | Out-Null
  Write-Host "Stopped process $targetPid on port $Port."
}

Stop-PortProcess -Port 18080
Stop-PortProcess -Port 18501
