#define MyAppName "Polaris"
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #error SourceDir not defined
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

[Setup]
AppId={{6E0BA0AB-6FB6-4773-9800-7E54B1D9310F}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppPublisher=Polaris
DefaultDirName={localappdata}\Programs\Polaris
DefaultGroupName=Polaris
DisableProgramGroupPage=yes
PrivilegesRequired=admin
CloseApplications=yes
RestartApplications=no
OutputDir={#OutputDir}
OutputBaseFilename=Polaris-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\runtime\scripts\launch_polaris.cmd

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Polaris"; Filename: "{app}\runtime\scripts\launch_polaris.cmd"; WorkingDir: "{app}"
Name: "{autoprograms}\Stop Polaris"; Filename: "{app}\runtime\scripts\stop_polaris.cmd"; WorkingDir: "{app}"
Name: "{autoprograms}\Remove Polaris Cloudflare Tunnel"; Filename: "{app}\runtime\scripts\remove_cloudflare_tunnel.cmd"; WorkingDir: "{app}"
Name: "{autodesktop}\Polaris"; Filename: "{app}\runtime\scripts\launch_polaris.cmd"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\runtime\scripts\install.ps1"" -AppDir ""{app}"""; Flags: runhidden waituntilterminated
Filename: "{app}\runtime\scripts\launch_polaris.cmd"; Description: "Launch Polaris now"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\runtime\scripts\stop_polaris.cmd"; WorkingDir: "{app}"; Flags: runhidden; RunOnceId: "StopPolaris"
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\runtime\scripts\uninstall_cleanup.ps1"" -AppDir ""{app}"""; Flags: runhidden waituntilterminated; RunOnceId: "CleanupPolarisFirewall"

[Code]
procedure StopExistingPolarisIfPresent;
var
  ExistingAppDir, StopScript: string;
  ResultCode: Integer;
begin
  ExistingAppDir := ExpandConstant('{app}');
  StopScript := AddBackslash(ExistingAppDir) + 'runtime\scripts\stop_polaris.cmd';
  if FileExists(StopScript) then
  begin
    Log('Stopping existing Polaris instance before upgrade: ' + StopScript);
    if Exec(StopScript, '', ExistingAppDir, SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      Log(Format('Existing Polaris stop script finished with exit code %d', [ResultCode]))
    else
      Log('Failed to execute existing Polaris stop script before upgrade.');
    Sleep(1500);
  end;
  Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -Command "$appDir = ''' + ExistingAppDir + '''; $ports = @(3000,3210,8888,13306); foreach ($port in $ports) { $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue; foreach ($listener in $listeners) { $proc = Get-CimInstance Win32_Process -Filter (''ProcessId='' + $listener.OwningProcess) -ErrorAction SilentlyContinue; if ($proc -and (($proc.ExecutablePath -and $proc.ExecutablePath.StartsWith($appDir, [System.StringComparison]::OrdinalIgnoreCase)) -or ($proc.CommandLine -and $proc.CommandLine.StartsWith($appDir, [System.StringComparison]::OrdinalIgnoreCase)))) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue; } } }"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  );
  Sleep(1000);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopExistingPolarisIfPresent;
  Result := '';
end;
