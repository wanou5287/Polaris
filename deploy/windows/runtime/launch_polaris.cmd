@echo off
setlocal
powershell.exe -ExecutionPolicy Bypass -File "%~dp0launch_polaris.ps1" -AppDir "%~dp0..\.."
exit /b %ERRORLEVEL%

