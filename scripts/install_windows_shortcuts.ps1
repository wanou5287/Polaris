param(
  [switch]$DesktopOnly,
  [switch]$StartupOnly
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$powershellExe = Join-Path $PSHOME "powershell.exe"
$wsh = New-Object -ComObject WScript.Shell
$desktopPath = [Environment]::GetFolderPath("Desktop")
$startupPath = $wsh.SpecialFolders("Startup")

function New-LauncherShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$ShortcutPath,
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [Parameter(Mandatory = $true)][string]$Description,
    [string]$ArgumentsSuffix = "",
    [int]$WindowStyle = 1,
    [string]$IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
  )

  $shortcut = $wsh.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $powershellExe
  $shortcut.Arguments = ('-ExecutionPolicy Bypass -File "{0}" {1}' -f $ScriptPath, $ArgumentsSuffix).Trim()
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.WindowStyle = $WindowStyle
  $shortcut.Description = $Description
  $shortcut.IconLocation = $IconLocation
  $shortcut.Save()
}

$startScript = Join-Path $scriptDir "start_bi_stack.ps1"
$stopScript = Join-Path $scriptDir "stop_bi_stack.ps1"

if (-not $StartupOnly) {
  $desktopStart = Join-Path $desktopPath "Supply Chain BI Start.lnk"
  $desktopStop = Join-Path $desktopPath "Supply Chain BI Stop.lnk"

  New-LauncherShortcut `
    -ShortcutPath $desktopStart `
    -ScriptPath $startScript `
    -Description "Start MySQL, dashboard and remote access" `
    -WindowStyle 7 `
    -IconLocation "$env:SystemRoot\System32\SHELL32.dll,220"

  New-LauncherShortcut `
    -ShortcutPath $desktopStop `
    -ScriptPath $stopScript `
    -Description "Stop dashboard and remote access" `
    -WindowStyle 7 `
    -IconLocation "$env:SystemRoot\System32\SHELL32.dll,131"

  Write-Host "Desktop shortcuts created:"
  Write-Host $desktopStart
  Write-Host $desktopStop
}

if (-not $DesktopOnly) {
  $startupShortcut = Join-Path $startupPath "Supply Chain BI AutoStart.lnk"

  New-LauncherShortcut `
    -ShortcutPath $startupShortcut `
    -ScriptPath $startScript `
    -ArgumentsSuffix "-NoOpenBrowser" `
    -Description "Auto start Supply Chain BI after Windows sign-in" `
    -WindowStyle 7 `
    -IconLocation "$env:SystemRoot\System32\SHELL32.dll,220"

  Write-Host "Startup shortcut created:"
  Write-Host $startupShortcut
}
