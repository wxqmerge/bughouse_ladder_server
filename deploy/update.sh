#!/bin/bash

# Update and restart the Bughouse Ladder server
# Usage: ./update.sh [service-name]

# Don't exit on error - keep SSH session alive
# We handle errors manually below

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
    if git stash; then
        echo "  Changes stashed."
    else
        echo "  ERROR: Failed to stash changes."
        echo "  Aborting. Fix your local changes and try again."
        exit 1
    fi
else
    echo "  No local changes to stash."
fi

# 2. Pull latest code
echo "[2/6] Pulling latest code..."
if ! git pull; then
    echo "  ERROR: git pull failed. Restoring stash..."
    git stash pop 2>/dev/null || true
    echo "  Aborting."
    exit 1
fi

# 3. Install dependencies
echo "[3/6] Installing dependencies..."
if [ -f "package.json" ]; then
    if ! npm install --production; then
        echo "  ERROR: Frontend npm install failed."
        exit 1
    fi
fi

# 4. Build frontend
echo "[4/6] Building frontend..."
if ! npm run build; then
    echo "  ERROR: Frontend build failed."
    echo "  Aborting. Check build output above."
    exit 1
fi

# 5. Build server
echo "[5/6] Building server..."
if [ -d "server" ] && [ -f "server/package.json" ]; then
    if ! (cd server && npm install --production); then
        echo "  ERROR: Server npm install failed."
        exit 1
    fi
    if ! (cd server && npm run build); then
        echo "  ERROR: Server build failed."
        echo "  Aborting. Check build output above."
        exit 1
    fi
else
    echo "  Skipped (no server directory)."
fi

# 6. Restart service
echo "[6/6] Restarting service: $SERVICE"
if ! sudo -n systemctl restart "$SERVICE" 2>&1; then
    echo "  ERROR: systemctl restart failed."
    echo "  If this says 'sudo: a password is required', you need passwordless sudo."
    echo "  Run: sudo visudo"
    echo "  Add: $(whoami) ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart *"
    echo "  Then re-run this script."
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
