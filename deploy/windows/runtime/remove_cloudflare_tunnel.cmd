@echo off
setlocal
powershell.exe -ExecutionPolicy Bypass -File "%~dp0remove_cloudflare_tunnel.ps1" -AppDir "%~dp0..\.."
exit /b %ERRORLEVEL%
