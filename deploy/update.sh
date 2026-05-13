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
echo "[1/9] Stashing local changes..."
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
echo "[2/9] Pulling latest code..."
if ! git pull; then
    echo "  ERROR: git pull failed. Restoring stash..."
    git stash pop 2>/dev/null || true
    echo "  Aborting."
    exit 1
fi

# 3. Validate API keys are configured
echo "[3/9] Validating API keys..."
ENV_FILE="$DIR/server/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "  ERROR: $ENV_FILE not found."
    echo "  API keys (USER_API_KEY and ADMIN_API_KEY) are required for production."
    echo "  Copy server/.env.example to server/.env and set your keys."
    exit 1
fi
if grep -q '^USER_API_KEY=' "$ENV_FILE"; then
    USER_KEY=$(grep '^USER_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '[:space:]')
else
    USER_KEY=""
fi
if grep -q '^ADMIN_API_KEY=' "$ENV_FILE"; then
    ADMIN_KEY=$(grep '^ADMIN_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '[:space:]')
else
    ADMIN_KEY=""
fi
if [ -z "$USER_KEY" ] || [ -z "$ADMIN_KEY" ]; then
    echo "  ERROR: API keys must be set in server/.env."
    if [ -z "$USER_KEY" ]; then echo "    - USER_API_KEY is not set"; fi
    if [ -z "$ADMIN_KEY" ]; then echo "    - ADMIN_API_KEY is not set"; fi
    echo "  Deploy aborted. Set both keys and try again."
    exit 1
fi
echo "  USER_API_KEY:    (set)"
echo "  ADMIN_API_KEY:   (set)"

# 4. Clean stale build artifacts
echo "[4/9] Cleaning stale build artifacts..."
if [ -d "dist" ]; then
    rm -rf dist
    echo "  Removed dist/"
fi
if [ -d "server/dist" ]; then
    rm -rf server/dist
    echo "  Removed server/dist/"
fi
# Clean shared/ JS files so Vite re-compiles from TypeScript sources
if [ -d "shared/utils" ]; then
    rm -f shared/utils/*.js shared/utils/*.js.map shared/utils/*.d.ts shared/utils/*.d.ts.map
    echo "  Removed stale shared/utils/*.js"
fi

# 5. Install dependencies (no --production: we need devDeps for building)
echo "[5/9] Installing dependencies..."
if [ -f "package.json" ]; then
    if ! npm install; then
        echo "  ERROR: Frontend npm install failed."
        exit 1
    fi
fi

# 6. Build frontend
echo "[6/9] Building frontend..."
if ! npm run build; then
    echo "  ERROR: Frontend build failed."
    echo "  Aborting. Check build output above."
    exit 1
fi

# 7. Build server
echo "[7/9] Building server..."
if [ -d "server" ] && [ -f "server/package.json" ]; then
    if ! (cd server && npm install); then
        echo "  ERROR: Server npm install failed."
        exit 1
    fi
    if ! (cd server && npm run build); then
        echo "  ERROR: Server build failed."
        echo "  Aborting. Check build output above."
        exit 1
    fi
    # Patch shared/*.js files to add .js extensions to relative imports
    # (TypeScript compiler strips .js extensions, but Node.js ESM requires them)
    echo "  Patching shared/ imports..."
    node scripts/patch-shared-imports.js
else
    echo "  Skipped (no server directory)."
fi

# 8. Fix systemd service file if needed (add EnvironmentFile)
echo "[8/9] Fixing systemd service file if needed..."
SERVICE_FILE="/etc/systemd/system/$SERVICE.service"
if [ -f "$SERVICE_FILE" ]; then
    if ! grep -q '^EnvironmentFile=' "$SERVICE_FILE"; then
        echo "  Fixing: adding EnvironmentFile to $SERVICE_FILE"
        # Determine the base directory (parent of deploy/instances/xxx)
        # The .env is at: base/server/.env
        # WorkingDirectory is: base/deploy/instances/$SERVICE
        # So we need: base/server/.env
        WORK_DIR=$(grep '^WorkingDirectory=' "$SERVICE_FILE" | head -1 | cut -d= -f2-)
        if [ -n "$WORK_DIR" ]; then
            # WorkingDirectory = /var/www/bughouse-ladder/deploy/instances/$SERVICE
            # Base = /var/www/bughouse-ladder
            BASE_DIR=$(dirname "$(dirname "$WORK_DIR")")
            ENV_FILE="$BASE_DIR/server/.env"
            if [ -f "$ENV_FILE" ]; then
                echo "  EnvironmentFile=$ENV_FILE" >> "$SERVICE_FILE"
                echo "  Added: EnvironmentFile=$ENV_FILE"
            else
                echo "  WARNING: $ENV_FILE not found, skipping EnvironmentFile"
            fi
        else
            echo "  WARNING: Could not determine WorkingDirectory, skipping fix"
        fi
        # Reload systemd to pick up service file changes
        echo "  Reloading systemd daemon..."
        if ! sudo -n systemctl daemon-reload 2>&1; then
            echo "  WARNING: systemctl daemon-reload failed."
        fi
    else
        echo "  Service file already has EnvironmentFile."
    fi
else
    echo "  WARNING: $SERVICE_FILE not found, skipping fix."
fi

# 9. Restart service
echo "[9/9] Restarting service: $SERVICE"
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
