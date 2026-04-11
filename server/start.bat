@echo off
echo ====================================
echo Bughouse Ladder Server - Quick Start
echo ====================================
echo.

REM Check if server directory exists
if not exist "server" (
    echo ❌ Error: 'server' directory not found!
    exit /b 1
)

cd server

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    echo.
)

REM Check if .env exists
if not exist ".env" (
    echo ⚙️  Creating .env file from template...
    copy .env.example .env
    echo ⚠️  Please edit server\.env with your configuration
    echo.
)

echo 🚀 Starting development server...
echo    → http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
call npm run dev
