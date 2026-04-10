@echo off
title CS2 Vault - Build

:: Auto-elevate to Administrator
net session >nul 2>&1
if errorlevel 1 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

color 0A
cd /d "%~dp0"

echo.
echo  =============================================
echo   CS2 VAULT - Building Windows App
echo  =============================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found! Download from nodejs.org
    pause & exit /b 1
)

echo  [1/3] Installing dependencies...
call npm install
if errorlevel 1 ( echo  ERROR: npm install failed & pause & exit /b 1 )

echo.
echo  [2/3] Building portable .exe (no installer needed)...
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
call npx electron-builder --win portable --publish never
if errorlevel 1 ( echo  ERROR: Build failed & pause & exit /b 1 )

echo.
echo  =============================================
echo   SUCCESS!
echo   Find "CS2 Vault Portable.exe" in dist\
echo   Just double-click it to run - no install!
echo  =============================================
echo.
pause
