@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this local preview.
  pause
  exit /b 1
)
start "" "http://localhost:4317/"
node dev-server.mjs
pause
