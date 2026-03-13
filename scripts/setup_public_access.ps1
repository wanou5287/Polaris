param(
  [int]$Port = $env:SERVER_PORT
)

if (-not $Port) { $Port = 8888 }

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  try {
    $argList = "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port"
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList | Out-Null
    Write-Host "Requested elevation. Please approve the UAC prompt."
    exit 0
  } catch {
    Write-Host "Failed to request elevation. Please run this script in an Administrator PowerShell."
    Write-Host $_.Exception.Message
    exit 1
  }
}

$RuleName = "FinvisPy-HTTP-$Port"

try {
  $existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -DisplayName $RuleName -Enabled True -ErrorAction Stop | Out-Null
    $ruleAction = "updated"
  } else {
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any -ErrorAction Stop | Out-Null
    $ruleAction = "created"
  }
} catch {
  Write-Host "Failed to create firewall rule. Please run this script as Administrator."
  Write-Host $_.Exception.Message
  exit 1
}

$lanIps = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -match "^[0-9]+\." } |
  Select-Object -ExpandProperty IPAddress

$lan = $lanIps | Select-Object -First 1

try {
  $public = Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 5
} catch {
  $public = ""
}

Write-Host "Firewall rule ${ruleAction}: ${RuleName} (TCP ${Port})"
if ($lan) {
  Write-Host "LAN URL:    http://${lan}:${Port}/financial/bi-dashboard"
}
if ($public) {
  Write-Host "Public URL: http://${public}:${Port}/financial/bi-dashboard"
} else {
  Write-Host "Public URL: <unable to detect>"
}
Write-Host "If you are behind a router, forward TCP ${Port} to ${lan}:${Port}."
