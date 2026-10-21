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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ladder-env.sh"
ENV_FILE="$DIR/server/.env"
SECRET_FILE="$(ladder_secret_file_for "$SERVICE")"
SERVICE_FILE="/etc/systemd/system/$SERVICE.service"

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
echo "[1/10] Stashing local changes..."
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

# 2. Pull latest code (or reset to remote if branches diverged)
echo "[2/10] Pulling latest code..."
if git pull --rebase 2>/dev/null; then
    echo "  Pulled successfully."
elif git fetch origin main && git reset --hard origin/main; then
    echo "  Branches diverged — reset to origin/main."
else
    echo "  ERROR: Failed to update from remote. Restoring stash..."
    git stash pop 2>/dev/null || true
    echo "  Aborting."
    exit 1
fi

# 3. Validate API keys are configured
echo "[3/10] Validating API keys..."
if [ ! -f "$ENV_FILE" ]; then
    echo "  ERROR: $ENV_FILE not found."
    echo "  API keys (USER_API_KEY and ADMIN_API_KEY) are required for production."
    echo "  Copy server/.env.example to server/.env and set your keys."
    exit 1
fi

KEY_SOURCE=""
if ladder_has_env_value ADMIN_API_KEY "$SECRET_FILE" && ladder_has_env_value USER_API_KEY "$SECRET_FILE"; then
    KEY_SOURCE="$SECRET_FILE"
    echo "  USER_API_KEY:    (set)"
    echo "  ADMIN_API_KEY:   (set)"
    echo "  Key source:      $SECRET_FILE"
elif ladder_has_env_value ADMIN_API_KEY "$ENV_FILE" && ladder_has_env_value USER_API_KEY "$ENV_FILE"; then
    KEY_SOURCE="$ENV_FILE"
    echo "  USER_API_KEY:    (set)"
    echo "  ADMIN_API_KEY:   (set)"
    echo "  WARNING: legacy key location: $ENV_FILE"
    echo "  Consider running: sudo bash ./deploy/secure-env.sh"
else
    echo "  ERROR: API keys are missing or unreadable."
    if ! ladder_has_env_value USER_API_KEY "$SECRET_FILE" "$ENV_FILE"; then
        echo "    - USER_API_KEY is not set"
    fi
    if ! ladder_has_env_value ADMIN_API_KEY "$SECRET_FILE" "$ENV_FILE"; then
        echo "    - ADMIN_API_KEY is not set"
    fi
    echo "  Deploy aborted. Set both keys and try again."
    exit 1
fi

# 3.5. Scan lockfile for newly published packages (supply chain protection)
echo "[3.5/10] Scanning lockfile for newly published packages..."
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
echo "[4/10] Cleaning stale build artifacts..."
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
echo "[5/10] Installing dependencies..."
   if [ -f "package.json" ]; then
        cooldown_type="normal"
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
            last_update=$(time_since_last_update)
            echo "  Skipped npm install - package cooldown active (last updated: $last_update)"
        fi
    fi

# 6. Build frontend
echo "[6/10] Building frontend..."
if ! npm run build; then
    echo "  ERROR: Frontend build failed."
    echo "  Aborting. Check build output above."
    exit 1
fi

# 7. Build server
echo "[7/10] Building server..."
   if [ -d "server" ] && [ -f "server/package.json" ]; then
        cooldown_type="normal"
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

# 8. Fix nginx config for SSE support (remove WebSocket headers, add long timeouts)
echo "[8/10] Fixing nginx config for SSE support..."
NGINX_CONF=""
for conf in /etc/nginx/sites-available/${SERVICE}.*.conf; do
    if [ -f "$conf" ]; then
        NGINX_CONF="$conf"
        break
    fi
done
if [ -f "$NGINX_CONF" ]; then
    FIXED=false
    if grep -q "Connection 'upgrade'" "$NGINX_CONF"; then
        sudo sed -i "s/proxy_set_header Connection 'upgrade'/proxy_set_header Connection \"\"/" "$NGINX_CONF"
        echo "  Fixed Connection header for SSE"
        FIXED=true
    fi
    if grep -q "proxy_cache_bypass" "$NGINX_CONF"; then
        sudo sed -i '/proxy_cache_bypass/d' "$NGINX_CONF"
        echo "  Removed WebSocket proxy_cache_bypass"
        FIXED=true
    fi
    if ! grep -q "proxy_read_timeout" "$NGINX_CONF"; then
        sudo sed -i '/proxy_set_header X-Forwarded-Proto/a\        proxy_read_timeout 86400;\n        proxy_send_timeout 86400;' "$NGINX_CONF"
        echo "  Added SSE timeout settings"
        FIXED=true
    fi
    if [ "$FIXED" = true ]; then
        sudo nginx -t 2>&1 && sudo systemctl reload nginx && echo "  Nginx reloaded"
    else
        echo "  Nginx config already SSE-compatible"
    fi
else
    echo "  No nginx config found, skipping"
fi

# 9. Fix systemd service file if needed (add EnvironmentFile inside [Service])
echo "[9/10] Fixing systemd service file if needed..."
if [ -f "$SERVICE_FILE" ]; then
    SERVICE_SECTION=$(sed -n '/^\[Service\]/,/^\[/p' "$SERVICE_FILE")
    if ! echo "$SERVICE_SECTION" | grep -q '^EnvironmentFile='; then
        if grep -q '^EnvironmentFile=' "$SERVICE_FILE" 2>/dev/null; then
            echo "  WARNING: EnvironmentFile found outside [Service] — replacing it."
            ladder_run_as_root sed -i '/^EnvironmentFile=/d' "$SERVICE_FILE"
        else
            echo "  No EnvironmentFile found — adding it."
        fi
    fi

    if ladder_ensure_environment_file "$SERVICE_FILE" "$ENV_FILE"; then
        echo "  EnvironmentFile: $ENV_FILE"
    else
        echo "  WARNING: Could not configure EnvironmentFile for $ENV_FILE"
    fi

    if [ -f "$SECRET_FILE" ]; then
        if ladder_ensure_environment_file "$SERVICE_FILE" "$SECRET_FILE"; then
            echo "  ProtectedKeyFile: $SECRET_FILE"
        else
            echo "  WARNING: Could not configure EnvironmentFile for $SECRET_FILE"
        fi
    fi
else
    echo "  WARNING: $SERVICE_FILE not found"
fi

# 9b. Tighten environment file permissions when permitted
echo "[9b/10] Tightening environment file permissions..."
tighten_env_permissions() {
    local file="$1"
    local mode="$2"

    if [ ! -f "$file" ]; then
        return 0
    fi

    if [ -w "$file" ]; then
        chmod "$mode" "$file" 2>/dev/null || true
    elif sudo -n true >/dev/null 2>&1; then
        sudo -n chmod "$mode" "$file" 2>/dev/null || true
    else
        echo "  WARNING: cannot update permissions for $file without write access or passwordless sudo."
    fi
}

tighten_env_permissions "$ENV_FILE" 640
if [ -f "$SECRET_FILE" ]; then
    tighten_env_permissions "$SECRET_FILE" 600
fi

# 10. Restart service
echo "[10/10] Restarting service: $SERVICE"
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
