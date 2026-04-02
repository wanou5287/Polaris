param(
    [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
)

$ErrorActionPreference = "Stop"

function Remove-FirewallRuleSafe {
    param([string]$DisplayName)

    try {
        $rules = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
        if ($rules) {
            $rules | Remove-NetFirewallRule | Out-Null
            return
        }
    } catch {
    }

    try {
        & netsh advfirewall firewall delete rule name="$DisplayName" | Out-Null
    } catch {
    }
}

Remove-FirewallRuleSafe -DisplayName "Polaris Frontend 3000"
Remove-FirewallRuleSafe -DisplayName "Polaris Backend 8888"
