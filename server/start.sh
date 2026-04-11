#!/bin/bash

echo "===================================="
echo "Bughouse Ladder Server - Quick Start"
echo "===================================="
echo ""

# Check if server directory exists
if [ ! -d "server" ]; then
    echo "❌ Error: 'server' directory not found!"
    exit 1
fi

cd server

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit server/.env with your configuration"
    echo ""
fi

echo "🚀 Starting development server..."
echo "   → http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm run dev
