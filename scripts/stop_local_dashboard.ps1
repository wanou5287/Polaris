$ErrorActionPreference = "Stop"

$port = 8888
$line = (netstat -ano | Select-String -SimpleMatch ":$port" | Select-String -SimpleMatch "LISTENING" | Select-Object -First 1)

if (-not $line) {
  Write-Host "No process is listening on port $port."
  exit 0
}

$tokens = ($line.ToString() -replace "\s+", " ").Trim().Split(" ")
$targetPid = $tokens[-1]

if (-not ($targetPid -match "^\d+$")) {
  Write-Host "Could not parse PID from netstat output: $line"
  exit 1
}

taskkill /PID $targetPid /F | Out-Null
Write-Host "Stopped process $targetPid on port $port."
