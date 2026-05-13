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

# 8. Fix systemd service file if needed (add EnvironmentFile inside [Service])
echo "[8/9] Fixing systemd service file if needed..."
SERVICE_FILE="/etc/systemd/system/$SERVICE.service"
if [ -f "$SERVICE_FILE" ]; then
    # Check if EnvironmentFile exists and is in the correct section ([Service])
    HAS_ENV_FILE=$(grep -c '^EnvironmentFile=' "$SERVICE_FILE" || true)
    if [ "$HAS_ENV_FILE" -gt 0 ]; then
        # Check if it's inside [Service] section (between [Service] and [Install])
        SERVICE_SECTION=$(sed -n '/^\[Service\]/,/^$/p' "$SERVICE_FILE")
        if echo "$SERVICE_SECTION" | grep -q '^EnvironmentFile='; then
            echo "  EnvironmentFile is correctly placed in [Service] section."
            grep '^EnvironmentFile=' "$SERVICE_FILE" | while read -r line; do echo "    $line"; done
        else
            echo "  WARNING: EnvironmentFile found but NOT in [Service] section — fixing..."
            sudo sh -c "sed -i '/^EnvironmentFile=/d' $SERVICE_FILE"
            echo "  Removed misplaced EnvironmentFile line(s)"
            ENV_FILE="$DIR/server/.env"
            if [ -f "$ENV_FILE" ]; then
                EXEC_LINE=$(grep -n '^ExecStart=' "$SERVICE_FILE" | head -1 | cut -d: -f1)
                if [ -n "$EXEC_LINE" ] && [ "$EXEC_LINE" -gt 1 ]; then
                    INSERT_LINE=$((EXEC_LINE - 1))
                    echo "  Inserting EnvironmentFile at line $INSERT_LINE (before ExecStart)"
                    sudo sh -c "sed -i '${INSERT_LINE}a EnvironmentFile=$ENV_FILE' $SERVICE_FILE"
                    echo "  Injected EnvironmentFile into [Service] section"
                else
                    echo "  ERROR: Could not find ExecStart line in $SERVICE_FILE"
                fi
            fi
        fi
    else
        echo "  No EnvironmentFile found — adding it."
        ENV_FILE="$DIR/server/.env"
        if [ -f "$ENV_FILE" ]; then
            echo "  EnvironmentFile=$ENV_FILE"
            EXEC_LINE=$(grep -n '^ExecStart=' "$SERVICE_FILE" | head -1 | cut -d: -f1)
            if [ -n "$EXEC_LINE" ] && [ "$EXEC_LINE" -gt 1 ]; then
                INSERT_LINE=$((EXEC_LINE - 1))
                echo "  Inserting at line $INSERT_LINE (before ExecStart at line $EXEC_LINE)"
                if ! sudo sh -c "sed -i '${INSERT_LINE}a EnvironmentFile=$ENV_FILE' $SERVICE_FILE" 2>&1; then
                    echo "  ERROR: Failed to modify $SERVICE_FILE"
                else
                    echo "  Injected EnvironmentFile into [Service] section"
                fi
            else
                echo "  ERROR: Could not find ExecStart line in $SERVICE_FILE"
            fi
        else
            echo "  WARNING: $ENV_FILE not found"
        fi
    fi
    echo "  Reloading systemd daemon..."
    if ! sudo -n systemctl daemon-reload 2>&1; then
        echo "  WARNING: systemctl daemon-reload failed."
    fi
else
    echo "  WARNING: $SERVICE_FILE not found"
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
    echo ""
    echo "To trace live logs: sudo journalctl -u $SERVICE -f"
else
    echo ""
    echo "=== WARNING: $SERVICE is NOT running! Check status: ==="
    echo "  sudo systemctl status $SERVICE"
    echo "  sudo journalctl -u $SERVICE --no-pager -n 20"
    exit 1
fi
