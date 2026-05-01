#!/bin/bash

# Verify setup - checks everything without sudo
# Run: ./deploy/verify.sh

# Derive project name from directory (e.g., /var/www/html/dev-ladder -> dev-ladder)
PROJECT_NAME=$(basename "$(pwd)")

# Domain: CLI arg > .env > scan for matching config
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ] && [ -f "server/.env" ]; then
    DOMAIN=$(grep '^DOMAIN=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
fi
if [ -z "$DOMAIN" ]; then
    # Scan for any config matching project-name.*.conf
    for conf in deploy/nginx/${PROJECT_NAME}.*.conf; do
        if [ -f "$conf" ]; then
            DOMAIN=$(basename "$conf" | sed "s/${PROJECT_NAME}\.//;s/\.conf//")
            break
        fi
    done
fi

echo "========================================"
echo "  Chess Ladder - Verify Setup"
echo "  Project: $PROJECT_NAME"
echo "========================================"
echo ""

PASS=0
FAIL=0
WARN=0

check() {
    local desc="$1"
    local cmd="$2"
    if eval "$cmd" > /dev/null 2>&1; then
        echo "  [PASS] $desc"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $desc"
        FAIL=$((FAIL + 1))
    fi
}

warn() {
    echo "  [WARN] $1"
    WARN=$((WARN + 1))
}

# --- Basic tools ---
echo "1. Basic tools"
check "node" "command -v node"
check "npm" "command -v npm"
check "git" "command -v git"
check "nginx" "command -v nginx"
check "certbot" "command -v certbot"
echo ""

# --- Node/npm ---
echo "2. Node/npm"
if command -v node > /dev/null 2>&1; then
    echo "  [INFO] node version: $(node --version 2>/dev/null)"
    echo "  [INFO] npm version: $(npm --version 2>/dev/null)"
else
    warn "node not found"
fi
echo ""

# --- Git repo ---
echo "3. Git repo"
check "git repo exists" "[ -d .git ]"
if [ -d .git ]; then
    echo "  [INFO] remote: $(git remote get-url origin 2>/dev/null)"
    echo "  [INFO] branch: $(git branch --show-current 2>/dev/null)"
    echo "  [INFO] latest commit: $(git log -1 --oneline 2>/dev/null)"
fi
echo ""

# --- Project structure ---
echo "4. Project structure"
check "package.json exists" "[ -f package.json ]"
check "server/package.json exists" "[ -f server/package.json ]"
check "deploy directory exists" "[ -d deploy ]"
check "deploy/nginx directory exists" "[ -d deploy/nginx ]"
check "deploy/instances directory exists" "[ -d deploy/instances ]"
echo ""

# --- Build outputs ---
echo "5. Build outputs"
check "dist/ directory" "[ -d dist ]"
check "server/dist/ directory" "[ -d server/dist ]"
if [ -f dist/index.html ]; then
    echo "  [INFO] dist/index.html exists ($(wc -c < dist/index.html) bytes)"
fi
if [ -f server/dist/index.js ]; then
    echo "  [INFO] server/dist/index.js exists ($(wc -c < server/dist/index.js) bytes)"
fi
echo ""

# --- Nginx ---
echo "6. Nginx"
if command -v nginx > /dev/null 2>&1; then
    echo "  [INFO] nginx version: $(nginx -v 2>&1)"
    check "nginx config test" "sudo nginx -t"
    echo "  [INFO] Project nginx config:"
    if [ -f "/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf" ]; then
        echo "    /etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf [OK]"
    else
        echo "    /etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf [MISSING]"
    fi
else
    warn "nginx not installed"
fi
echo ""

# --- Systemd services ---
echo "7. Systemd services"
svc_file="/etc/systemd/system/${PROJECT_NAME}.service"
if [ -f "$svc_file" ]; then
    echo "  [INFO] Service file exists: ${PROJECT_NAME}.service"
    if systemctl is-active "$PROJECT_NAME" 2>/dev/null | grep -q "active"; then
        echo "    [INFO] Status: running"
    else
        echo "    [WARN] Status: not running"
    fi
else
    echo "  [WARN] Service file missing: ${PROJECT_NAME}.service"
fi
echo ""

# --- SSL certificates ---
echo "8. SSL certificates"
if command -v certbot > /dev/null 2>&1; then
    echo "  [INFO] Certbot certificates:"
    SERVER_CONF="/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf"
    proj_domain=$(grep 'server_name' "$SERVER_CONF" 2>/dev/null | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
    if [ -n "$proj_domain" ]; then
        certbot certificates 2>/dev/null | grep -E "Domain|Path" | while read -r line; do
            if echo "$line" | grep -q "$proj_domain"; then
                echo "    $line"
            fi
        done
    else
        echo "    [WARN] No domain found in $SERVER_CONF"
    fi
else
    warn "certbot not installed"
fi
echo ""

# --- DNS ---
echo "9. DNS resolution"
SERVER_CONF="/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf"
if [ -f "$SERVER_CONF" ]; then
    domains=$(grep 'server_name' "$SERVER_CONF" 2>/dev/null | sed 's/server_name//;s/;//' | tr -s ' ')
    for domain in $domains; do
        if command -v dig > /dev/null 2>&1; then
            ip=$(dig +short "$domain" 2>/dev/null | head -1)
        elif command -v nslookup > /dev/null 2>&1; then
            ip=$(nslookup "$domain" 2>/dev/null | grep "Address" | tail -1 | awk '{print $2}')
        else
            ip="tool not available"
        fi
        if [ -n "$ip" ] && [ "$ip" != "tool not available" ]; then
            echo "  [PASS] $domain -> $ip"
        else
            echo "  [FAIL] $domain -> no DNS record"
        fi
    done
else
    echo "  [WARN] No config found: $SERVER_CONF"
fi
echo ""

# --- Sudo config ---
echo "10. Sudo configuration"
echo "  [INFO] Current user: $(whoami)"
echo "  [INFO] sudoers check:"
if sudo -n true 2>/dev/null; then
    echo "    [PASS] Passwordless sudo works"
else
    echo "    [FAIL] sudo requires password (will hang in SSH without TTY)"
    echo "    [FIX] Add this to /etc/sudoers.d/${PROJECT_NAME}.${DOMAIN}:"
    echo "          $(whoami) ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart *"
    echo "          $(whoami) ALL=(ALL) NOPASSWD: /usr/bin/systemctl status *"
    echo "          $(whoami) ALL=(ALL) NOPASSWD: /usr/bin/systemctl is-active *"
    echo "          $(whoami) ALL=(ALL) NOPASSWD: /usr/bin/nginx"
fi
echo ""

# --- Port usage ---
echo "11. Port usage"

# Read PORT from server/.env
PORT=3000
if [ -f "server/.env" ]; then
    env_port=$(grep '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
    if [ -n "$env_port" ]; then
        PORT=$env_port
    fi
fi

echo "  [INFO] PORT from server/.env: $PORT"

# Also check systemd service file for its PORT
svc_file="/etc/systemd/system/${PROJECT_NAME}.service"
if [ -f "$svc_file" ]; then
    svc_port=$(grep '^Environment=PORT=' "$svc_file" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
    if [ -n "$svc_port" ]; then
        echo "  [INFO] ${PROJECT_NAME}.service: PORT=$svc_port"
    fi
fi

# Check the configured port
if command -v ss > /dev/null 2>&1; then
    listener=$(ss -tlnp 2>/dev/null | grep ":$PORT " | head -1)
elif command -v netstat > /dev/null 2>&1; then
    listener=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | head -1)
else
    listener=""
fi
if [ -n "$listener" ]; then
    echo "  [INFO] Port $PORT: IN USE ($listener)"
else
    echo "  [INFO] Port $PORT: free"
fi
echo ""

# --- Client Config Strings ---
echo "12. Client Config Strings"

# Read API keys from server/.env
ADMIN_KEY=""
USER_KEY=""
if [ -f "server/.env" ]; then
    ADMIN_KEY=$(grep '^ADMIN_API_KEY=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
    USER_KEY=$(grep '^USER_API_KEY=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
fi

# Extract domain from server nginx config
CONF_DOMAIN=$(grep 'server_name' "/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf" 2>/dev/null | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')

if [ -n "$CONF_DOMAIN" ]; then
    echo "  [INFO] Domain: $CONF_DOMAIN"
    echo ""
    echo "    Admin:"
    echo "      http://$CONF_DOMAIN/dist/?config=1&server=https://$CONF_DOMAIN&key=$ADMIN_KEY"
    echo ""
    echo "    User:"
    echo "      http://$CONF_DOMAIN/dist/?config=1&server=https://$CONF_DOMAIN&key=$USER_KEY"
    echo ""
    echo "    View:"
    echo "      http://$CONF_DOMAIN/dist/?config=1&server=https://$CONF_DOMAIN"
    echo ""
else
    echo "  [WARN] No domain found in /etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf - cannot generate config strings"
fi
echo ""

# --- Summary ---
echo "========================================"
echo "  Summary: $PASS passed, $FAIL failed, $WARN warnings"
echo "========================================"

if [ $FAIL -gt 0 ]; then
    echo ""
    echo "Fix the [FAIL] items above and re-run."
fi

if [ $WARN -gt 0 ]; then
    echo ""
    echo "Fix the [WARN] items above if needed."
fi

echo ""
if [ $FAIL -eq 0 ]; then
    echo "Everything looks good!"
fi

# Always exit 0 to avoid killing SSH session
exit 0
