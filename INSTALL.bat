@echo off
title CS2 Vault — Setup
color 0A
echo.
echo  ██████╗███████╗██████╗     ██╗   ██╗ █████╗ ██╗   ██╗██╗  ████████╗
echo ██╔════╝██╔════╝╚════██╗    ██║   ██║██╔══██╗██║   ██║██║  ╚══██╔══╝
echo ██║     ███████╗ █████╔╝    ██║   ██║███████║██║   ██║██║     ██║
echo ██║     ╚════██║ ╚═══██╗    ╚██╗ ██╔╝██╔══██║██║   ██║██║     ██║
echo ╚██████╗███████║██████╔╝     ╚████╔╝ ██║  ██║╚██████╔╝███████╗██║
echo  ╚═════╝╚══════╝╚═════╝       ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝
echo.
echo  CS2 Vault Desktop App — First Time Setup
echo  ==========================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please install Node.js from: https://nodejs.org
    echo  Download the LTS version, install it, then run this script again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER% found
echo.

:: Install dependencies
echo  Installing dependencies...
echo  (No Visual Studio or build tools required)
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo  [OK] Dependencies installed successfully!
echo.
echo  ============================================
echo   Setup complete! Starting CS2 Vault now...
echo  ============================================
echo.

call npm start

pause
