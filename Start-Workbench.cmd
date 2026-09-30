@echo off
rem Author: CA
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js version 18 or later is required: https://nodejs.org/
  pause
  exit /b 1
)
node scripts/serve.mjs --open
if errorlevel 1 pause
