@echo off
rem Author: CA
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js version 18 or later is required: https://nodejs.org/
  pause
  exit /b 1
)
node scripts/sync.mjs
if errorlevel 1 (
  echo Data import failed. Please check the messages above.
) else (
  echo Data updated. Reload the web page. Rebuild the EXE to update the portable app.
)
pause
