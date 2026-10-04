@echo off
setlocal
title RUST RADAR - DEMO MODE
echo ================================================
echo   RUST RADAR - demo mode (fake Steam + servers)
echo ================================================
echo.

rem --- backend (demo) on 3001: start if not running ---
curl -s -m 2 http://127.0.0.1:3001/api/health >nul 2>&1
if %errorlevel%==0 (
  echo [ok] Backend already running - keep it
) else (
  echo [1/2] Starting backend in DEMO mode...
  start "RADAR backend DEMO" cmd /k "cd /d %~dp0backend && npm run demo"
  echo       waiting 6 sec...
  ping -n 7 127.0.0.1 >nul
)

rem --- frontend on 5173: start if not running ---
curl -s -m 2 -o nul http://127.0.0.1:5173/ >nul 2>&1
if %errorlevel%==0 (
  echo [ok] Frontend already running - keep it
) else (
  echo [2/2] Starting frontend...
  start "RADAR frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
  echo       waiting 6 sec...
  ping -n 7 127.0.0.1 >nul
)

start "" http://localhost:5173

echo.
echo Done! Site: http://localhost:5173
echo Demo adds 3 fake enemies automatically.
echo Two black windows = servers, do NOT close them.
echo.
pause
