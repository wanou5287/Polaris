@echo off
setlocal
powershell.exe -ExecutionPolicy Bypass -File "%~dp0stop_polaris.ps1" -AppDir "%~dp0..\.."
exit /b %ERRORLEVEL%

