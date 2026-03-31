@echo off
setlocal

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173"') do (
  taskkill /PID %%a /F >nul 2>nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3210"') do (
  taskkill /PID %%a /F >nul 2>nul
)

exit /b 0
