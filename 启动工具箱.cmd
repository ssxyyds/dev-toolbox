@echo off
cd /d "%~dp0"
if exist "release\SsxToolbox-win32-x64\SsxToolbox.exe" (
  start "" "release\SsxToolbox-win32-x64\SsxToolbox.exe"
) else (
  echo Please run npm install and npm run pack first.
  pause
)
