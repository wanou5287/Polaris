@echo off
setlocal

cd /d "%~dp0"

echo.
echo [售后查询系统] 正在检查环境并启动，请稍候...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-local.ps1"

exit /b %errorlevel%
