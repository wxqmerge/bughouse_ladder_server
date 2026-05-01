#!/bin/bash

# Update and restart the Bughouse Ladder server
# Usage: ./update.sh [service-name]

set -euo pipefail

SERVICE="${1:-$(basename "$PWD")}"
DIR="$(pwd)"

echo "=== Updating $SERVICE ==="
echo "Directory: $DIR"
echo "Service:   $SERVICE"
echo ""
echo "To trace live logs: sudo journalctl -u $SERVICE -f"
echo ""

# 1. Stash any local changes
echo "[1/6] Stashing local changes..."
if ! git diff --quiet 2>/dev/null; then
    git stash
    echo "  Changes stashed."
else
    echo "  No local changes to stash."
fi

# 2. Pull latest code
echo "[2/6] Pulling latest code..."
if ! git pull; then
    echo "  ERROR: git pull failed. Restoring stash..."
    git stash pop 2>/dev/null || true
    exit 1
fi

# 3. Install dependencies
echo "[3/6] Installing dependencies..."
if [ -f "package.json" ]; then
    if ! npm ci --production --silent 2>/dev/null; then
        echo "  WARNING: npm ci failed, trying npm install..."
        npm install --production --silent 2>/dev/null || echo "  WARNING: npm install also failed, continuing..."
    fi
fi

# 4. Build frontend
echo "[4/6] Building frontend..."
if ! npm run build 2>/dev/null; then
    echo "  ERROR: Frontend build failed."
    exit 1
fi

# 5. Build server
echo "[5/6] Building server..."
if [ -d "server" ] && [ -f "server/package.json" ]; then
    (cd server && npm ci --production --silent 2>/dev/null || npm install --production --silent 2>/dev/null || true)
    if ! (cd server && npm run build 2>/dev/null); then
        echo "  ERROR: Server build failed."
        exit 1
    fi
else
    echo "  Skipped (no server directory)."
fi

# 6. Restart service
echo "[6/6] Restarting service: $SERVICE"
if ! sudo systemctl restart "$SERVICE"; then
    echo "  ERROR: systemctl restart failed."
    exit 1
fi

# Verify service is running
sleep 2
if sudo systemctl is-active --quiet "$SERVICE"; then
    echo ""
    echo "=== Update complete. $SERVICE is running. ==="
else
    echo ""
    echo "=== WARNING: $SERVICE is NOT running! Check status: ==="
    echo "  sudo systemctl status $SERVICE"
    echo "  sudo journalctl -u $SERVICE --no-pager -n 20"
    exit 1
fi
