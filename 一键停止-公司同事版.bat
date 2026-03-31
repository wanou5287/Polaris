@echo off
setlocal

cd /d "%~dp0"

call "%~dp0stop-local.bat"

echo.
echo [售后查询系统] 本地服务已停止。
echo.
pause
