#!/bin/bash

# Update and restart the Bughouse Ladder server
# Usage: ./update.sh [service-name] [--force|--force-critical]
#   --force          Bypass all cooldowns and force package update
#   --force-critical Force package update for critical security patches (2-day cooldown)

# Don't exit on error - keep SSH session alive
# We handle errors manually below

# Parse command-line flags first (before SERVICE assignment)
FORCE_UPDATE=false
FORCE_CRITICAL=false
SERVICE_NAME=""

for arg in "$@"; do
    case $arg in
        --force)
            FORCE_UPDATE=true
            ;;
        --force-critical)
            FORCE_CRITICAL=true
            ;;
        -*)
            echo "Unknown flag: $arg"
            echo "Usage: $0 [service-name] [--force|--force-critical]"
            exit 1
            ;;
        *)
            if [ -z "$SERVICE_NAME" ]; then
                SERVICE_NAME="$arg"
            fi
            ;;
    esac
done

SERVICE="${SERVICE_NAME:-$(basename "$PWD")}"
DIR="$(pwd)"

# Dependency cooldown configuration
# Normal cooldown: 7 days between package updates
# Critical security patches: 2 days (use --force-critical flag)
LAST_PACKAGE_UPDATE_FILE="$DIR/.last-package-update"
PACKAGE_COOLDOWN_NORMAL=604800    # 7 days in seconds
PACKAGE_COOLDOWN_CRITICAL=172800  # 2 days in seconds

# Check if package cooldown has passed
# Returns 0 if cooldown passed, 1 if still in cooldown
check_package_cooldown() {
    local cooldown_type="${1:-normal}"
    local cooldown_seconds
    
    if [ "$cooldown_type" = "critical" ]; then
        cooldown_seconds=$PACKAGE_COOLDOWN_CRITICAL
    else
        cooldown_seconds=$PACKAGE_COOLDOWN_NORMAL
    fi
    
    if [ ! -f "$LAST_PACKAGE_UPDATE_FILE" ]; then
        return 0  # Never updated — allow
    fi
    
    if [ "$FORCE_UPDATE" = true ]; then
        return 0  # Force override
    fi
    
    if [ "$FORCE_CRITICAL" = true ] && [ "$cooldown_type" = "critical" ]; then
        return 0  # Critical force override
    fi
    
    local last_update
    last_update=$(stat -c %Y "$LAST_PACKAGE_UPDATE_FILE" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local diff=$((now - last_update))
    
    if [ "$diff" -ge "$cooldown_seconds" ]; then
        return 0  # Cooldown passed
    fi
    
    return 1  # Still in cooldown
}

# Record the timestamp of the last package update
record_package_update() {
    date +%s > "$LAST_PACKAGE_UPDATE_FILE"
}

# Get human-readable time since last update
time_since_last_update() {
    if [ ! -f "$LAST_PACKAGE_UPDATE_FILE" ]; then
        echo "never"
        return
    fi
    local last_update
    last_update=$(stat -c %Y "$LAST_PACKAGE_UPDATE_FILE" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local diff=$((now - last_update))
    local days=$((diff / 86400))
    local hours=$(( (diff % 86400) / 3600 ))
    echo "${days}d ${hours}h ago"
}

# Scan lockfile for packages published within cooldown period
# Returns 0 if any package is too new, 1 if all packages are old enough
scan_lockfile_age() {
    local lockfile="$1"
    local cooldown_type="${2:-normal}"
    local cooldown_seconds
    
    if [ "$cooldown_type" = "critical" ]; then
        cooldown_seconds=$PACKAGE_COOLDOWN_CRITICAL
    else
        cooldown_seconds=$PACKAGE_COOLDOWN_NORMAL
    fi
    
    if [ ! -f "$lockfile" ]; then
        return 1  # No lockfile — nothing to scan
    fi
    
    # Extract package names and versions from lockfile
    local packages
    packages=$(grep -E '^\s+"(sha512|version|name)":' "$lockfile" | paste - - - | \
        sed -n 's/.*"name": "\([^"]*\)".*"version": "\([^"]*\)".*"sha512": "\([^"]*\)".*/\1@\3/p' | \
        sed 's/\/@.*//' | sort -u)
    
    if [ -z "$packages" ]; then
        return 1  # No packages found
    fi
    
    local new_packages=()
    
    for pkg in $packages; do
        # Skip empty lines
        [ -z "$pkg" ] && continue
        
        # Extract package name (format: name@sha512hash)
        local pkg_name
        pkg_name=$(echo "$pkg" | cut -d'@' -f1)
        
        # Query npm registry for publication date
        local pub_date
        pub_date=$(curl -s --max-time 5 "https://registry.npmjs.org/$pkg_name" | \
            grep -o '"time":{"[^"]*": "[^"]*"}' | \
            grep -o '"[^"]*": "[^"]*"' | tail -1 | \
            cut -d'"' -f4)
        
        if [ -z "$pub_date" ]; then
            continue  # Skip if we can't determine publication date
        fi
        
        # Convert publication date to epoch
        local pkg_epoch
        pkg_epoch=$(date -d "$pub_date" +%s 2>/dev/null || echo 0)
        local now
        now=$(date +%s)
        local diff=$((now - pkg_epoch))
        
        if [ "$diff" -lt "$cooldown_seconds" ] && [ "$diff" -gt 0 ]; then
            new_packages+=("$pkg_name ($pub_date)")
        fi
    done
    
    if [ ${#new_packages[@]} -gt 0 ]; then
        echo "  WARNING: The following packages were published within the cooldown period:"
        for pkg in "${new_packages[@]}"; do
            echo "    - $pkg"
        done
        echo "  Consider waiting before deploying to avoid supply chain attacks."
        return 0  # Found new packages
    fi
    
    return 1  # All packages old enough
}

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

# 3.5. Scan lockfile for newly published packages (supply chain protection)
echo "[3.5/9] Scanning lockfile for newly published packages..."
new_packages_found=false

if [ -f "package-lock.json" ]; then
    if scan_lockfile_age "package-lock.json" "normal"; then
        new_packages_found=true
    fi
fi

if [ -f "server/package-lock.json" ]; then
    if scan_lockfile_age "server/package-lock.json" "normal"; then
        new_packages_found=true
    fi
fi

if [ "$new_packages_found" = false ]; then
    echo "  All packages are older than the cooldown period."
fi
echo ""

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
    local cooldown_type="normal"
    if [ "$FORCE_CRITICAL" = true ]; then
        cooldown_type="critical"
        echo "  WARNING: Using critical security patch cooldown (2 days)"
    fi
    if check_package_cooldown "$cooldown_type"; then
        if ! npm install; then
            echo "  ERROR: Frontend npm install failed."
            exit 1
        fi
        record_package_update
        echo "  Dependencies installed (packages updated after ${PACKAGE_COOLDOWN_NORMAL} second cooldown)."
    else
        local last_update
        last_update=$(time_since_last_update)
        echo "  Skipped npm install — package cooldown active (last updated: $last_update)"
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
    local cooldown_type="normal"
    if [ "$FORCE_CRITICAL" = true ]; then
        cooldown_type="critical"
    fi
    if check_package_cooldown "$cooldown_type"; then
        if ! (cd server && npm install); then
            echo "  ERROR: Server npm install failed."
            exit 1
        fi
    else
        echo "  Skipped server npm install — package cooldown active."
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
