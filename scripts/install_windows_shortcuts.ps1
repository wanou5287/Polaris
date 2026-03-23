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

  $shortcutDir = Split-Path -Parent $ShortcutPath
  $shortcutLeaf = Split-Path -Leaf $ShortcutPath
  $targetShortcutPath = $ShortcutPath
  if ($shortcutLeaf -match '[^\u0000-\u007F]') {
    $targetShortcutPath = Join-Path $shortcutDir ("polaris-shortcut-{0}.lnk" -f ([guid]::NewGuid().ToString("N")))
  }

  $shortcut = $wsh.CreateShortcut($targetShortcutPath)
  $shortcut.TargetPath = $powershellExe
  $shortcut.Arguments = ('-ExecutionPolicy Bypass -File "{0}" {1}' -f $ScriptPath, $ArgumentsSuffix).Trim()
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.WindowStyle = $WindowStyle
  $shortcut.Description = $Description
  $shortcut.IconLocation = $IconLocation
  $shortcut.Save()

  if ($targetShortcutPath -ne $ShortcutPath) {
    if (Test-Path $ShortcutPath) {
      Remove-Item -Path $ShortcutPath -Force
    }
    Push-Location $shortcutDir
    try {
      cmd /c "ren ""$(Split-Path -Leaf $targetShortcutPath)"" ""$shortcutLeaf""" | Out-Null
    } finally {
      Pop-Location
    }
  }
}

$startScript = Join-Path $scriptDir "start_bi_stack.ps1"
$stopScript = Join-Path $scriptDir "stop_bi_stack.ps1"

if (-not $StartupOnly) {
  $desktopStart = Join-Path $desktopPath "北极星启动.lnk"
  $desktopStop = Join-Path $desktopPath "北极星停止.lnk"

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
  $startupShortcut = Join-Path $startupPath "北极星开机自启.lnk"

  New-LauncherShortcut `
    -ShortcutPath $startupShortcut `
    -ScriptPath $startScript `
    -ArgumentsSuffix "-NoOpenBrowser" `
    -Description "Auto start Polaris after Windows sign-in" `
    -WindowStyle 7 `
    -IconLocation "$env:SystemRoot\System32\SHELL32.dll,220"

  Write-Host "Startup shortcut created:"
  Write-Host $startupShortcut
}
