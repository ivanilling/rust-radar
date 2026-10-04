@echo off
setlocal
title RUST RADAR - REAL MODE
echo ================================================
echo   RUST RADAR - real mode (real Steam API)
echo ================================================
echo.

rem --- check that STEAM_API_KEY is filled in backend\.env ---
powershell -NoProfile -Command "if ((Get-Content -LiteralPath '%~dp0backend\.env' | Where-Object {$_ -match '^STEAM_API_KEY=.+'}) -eq $null) { exit 1 } else { exit 0 }" >nul 2>&1
if %errorlevel% neq 0 (
  echo [STOP] Steam API key is not set!
  echo.
  echo   1. Open file:  D:\rust-radar\backend\.env  ^(Notepad^)
  echo   2. Find line:  STEAM_API_KEY=
  echo   3. Paste your key right after =  ^(no spaces^)
  echo   4. Free key here: https://steamcommunity.com/dev/apikey
  echo   5. Save the file and run start-real.bat again
  echo.
  pause
  exit /b 1
)
echo [ok] Steam API key found
echo.

rem --- backend on 3001: start if not running ---
curl -s -m 2 http://127.0.0.1:3001/api/health >nul 2>&1
if %errorlevel%==0 (
  echo [ok] Backend already running - keep it
) else (
  echo [1/2] Starting backend...
  start "RADAR backend REAL" cmd /k "cd /d %~dp0backend && npm run dev"
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
echo Two black windows = servers, do NOT close them.
echo To stop everything: close both black windows.
echo.
pause
