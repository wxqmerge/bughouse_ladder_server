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

# --- Version consistency ---
echo "6. Version consistency"
CLIENT_VERSION=$(grep '"version"' package.json 2>/dev/null | head -1 | sed 's/.*"version": *"//;s/".*//')
SERVER_VERSION=$(grep '"version"' server/package.json 2>/dev/null | head -1 | sed 's/.*"version": *"//;s/".*//')
if [ -n "$CLIENT_VERSION" ] && [ -n "$SERVER_VERSION" ]; then
    if [ "$CLIENT_VERSION" = "$SERVER_VERSION" ]; then
        echo "  [PASS] Client $CLIENT_VERSION == Server $SERVER_VERSION"
    else
        echo "  [FAIL] Client $CLIENT_VERSION != Server $SERVER_VERSION"
        FAIL=$((FAIL + 1))
    fi
else
    warn "Could not read version from package.json files"
fi
echo ""

# --- Nginx ---
echo "7. Nginx"
if command -v nginx > /dev/null 2>&1; then
    echo "  [INFO] nginx version: $(nginx -v 2>&1)"
    check "nginx config test" "sudo nginx -t"
    echo "  [INFO] Project nginx config:"
    SERVER_CONF="/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf"
    if [ -f "$SERVER_CONF" ]; then
        echo "    /etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf [OK]"
    else
        echo "    /etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf [MISSING]"
        FAIL=$((FAIL + 1))
    fi
    # Check if config is actually ENABLED (symlinked to sites-enabled)
    ENABLED_LINK="/etc/nginx/sites-enabled/${PROJECT_NAME}.${DOMAIN}.conf"
    if [ -L "$ENABLED_LINK" ]; then
        # Verify the symlink target is valid
        if [ -e "$ENABLED_LINK" ]; then
            echo "    /etc/nginx/sites-enabled/${PROJECT_NAME}.${DOMAIN}.conf [ENABLED]"
            PASS=$((PASS + 1))
        else
            echo "    /etc/nginx/sites-enabled/${PROJECT_NAME}.${DOMAIN}.conf [BROKEN SYMLINK]"
            FAIL=$((FAIL + 1))
            echo "  [FIX] Remove broken link: sudo rm $ENABLED_LINK"
            echo "  [FIX] Re-create: sudo ln -s $SERVER_CONF $ENABLED_LINK"
        fi
    else
        echo "    /etc/nginx/sites-enabled/${PROJECT_NAME}.${DOMAIN}.conf [NOT ENABLED]"
        FAIL=$((FAIL + 1))
        echo "  [FIX] Enable config: sudo ln -s $SERVER_CONF /etc/nginx/sites-enabled/"
        echo "  [FIX] Then reload: sudo systemctl reload nginx"
    fi
    # Also check for other enabled configs that might conflict
    echo "  [INFO] All enabled configs:"
    for link in /etc/nginx/sites-enabled/*; do
        if [ -L "$link" ]; then
            target=$(readlink -f "$link" 2>/dev/null)
            echo "    $(basename "$link") -> $target"
        fi
    done
else
    warn "nginx not installed"
fi
echo ""

# --- Systemd services ---
echo "8. Systemd services"
svc_file="/etc/systemd/system/${PROJECT_NAME}.service"
if [ -f "$svc_file" ]; then
    echo "  [INFO] Service file exists: ${PROJECT_NAME}.service"
    if systemctl is-active "$PROJECT_NAME" 2>/dev/null | grep -q "active"; then
        echo "    [INFO] Status: running"
    else
        echo "    [FAIL] Status: not running"
        FAIL=$((FAIL + 1))
    fi
else
    echo "  [FAIL] Service file missing: ${PROJECT_NAME}.service"
    FAIL=$((FAIL + 1))
fi
echo ""

# --- SSL certificates ---
echo "9. SSL certificates"
if command -v certbot > /dev/null 2>&1; then
    echo "  [INFO] Certbot certificates:"
    SERVER_CONF="/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf"
    proj_domain=$(grep 'server_name' "$SERVER_CONF" 2>/dev/null | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
    if [ -n "$proj_domain" ]; then
        if certbot certificates 2>/dev/null | grep -q "$proj_domain"; then
            certbot certificates 2>/dev/null | grep -E "Domain|Path" | while read -r line; do
                if echo "$line" | grep -q "$proj_domain"; then
                    echo "    $line"
                fi
            done
        else
            echo "    [INFO] No SSL cert for $proj_domain yet"
        fi
        
        # Check if nginx is using SSL (listen 443 ssl)
        if [ -f "$SERVER_CONF" ]; then
            if grep -q 'listen 443 ssl' "$SERVER_CONF"; then
                echo "    [INFO] SSL: configured in nginx"
            else
                echo "    [INFO] SSL: nginx not yet configured with 443"
            fi
        fi
    else
        echo "    [INFO] No domain found in $SERVER_CONF"
    fi
else
    echo "  [INFO] certbot not installed"
fi
echo ""

# --- DNS ---
echo "10. DNS resolution"
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
    echo "  [FAIL] No config found: $SERVER_CONF"
    FAIL=$((FAIL + 1))
fi
echo ""

# --- Sudo config ---
echo "11. Sudo configuration"
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
echo "12. Port usage"

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
    PASS=$((PASS + 1))
else
    echo "  [FAIL] Port $PORT: not listening — backend is not running!"
    FAIL=$((FAIL + 1))
    echo "  [FIX] Start the service: sudo systemctl start $PROJECT_NAME"
fi
echo ""

# --- Health endpoint (via nginx) ---
echo "13. Health endpoint (nginx proxy)"
SERVER_CONF="/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf"
if [ -f "$SERVER_CONF" ]; then
    proj_domain=$(grep 'server_name' "$SERVER_CONF" 2>/dev/null | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
    if [ -n "$proj_domain" ]; then
        HEALTH_URL="https://${proj_domain}/health"
        http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null)
        if [ "$http_code" = "200" ]; then
            body=$(curl -sk --max-time 5 "$HEALTH_URL" 2>/dev/null)
            echo "  [PASS] $HEALTH_URL (HTTP $http_code)"
            echo "  [INFO] Response: $(echo "$body" | head -c 120)..."
            PASS=$((PASS + 1))
        elif [ "$http_code" = "000" ]; then
            echo "  [FAIL] $HEALTH_URL — connection refused (nginx not proxying)"
            FAIL=$((FAIL + 1))
            echo "  [FIX] Check nginx is enabled: ls -la /etc/nginx/sites-enabled/"
            echo "  [FIX] Check backend is running: ss -tlnp | grep $PORT"
        else
            echo "  [FAIL] $HEALTH_URL — HTTP $http_code"
            FAIL=$((FAIL + 1))
            if [ "$http_code" = "404" ]; then
                echo "  [FIX] nginx is running but proxy_pass is not configured correctly"
                echo "  [FIX] Check config: cat $SERVER_CONF"
            fi
        fi
    else
        warn "Could not determine server_name from $SERVER_CONF"
    fi
else
    warn "No nginx config found — skipping health check"
fi
echo ""

# --- Nginx proxy_pass config ---
echo "14. Nginx proxy_pass"
if [ -f "$SERVER_CONF" ]; then
    proxy_target=$(grep 'proxy_pass' "$SERVER_CONF" 2>/dev/null | head -1 | sed 's/.*proxy_pass//;s/;//' | tr -d '[:space:]')
    if [ -n "$proxy_target" ]; then
        echo "  [INFO] proxy_pass: $proxy_target"
        # Extract port from proxy target
        proxy_port=$(echo "$proxy_target" | grep -oP ':\K[0-9]+')
        if [ -n "$proxy_port" ]; then
            if command -v ss > /dev/null 2>&1; then
                proxy_listener=$(ss -tlnp 2>/dev/null | grep ":$proxy_port " | head -1)
            elif command -v netstat > /dev/null 2>&1; then
                proxy_listener=$(netstat -tlnp 2>/dev/null | grep ":$proxy_port " | head -1)
            fi
            if [ -n "$proxy_listener" ]; then
                echo "  [PASS] Port $proxy_port is listening ($proxy_listener)"
                PASS=$((PASS + 1))
            else
                echo "  [FAIL] Port $proxy_port is NOT listening — backend not running!"
                FAIL=$((FAIL + 1))
                echo "  [FIX] The proxy target ($proxy_target) has nothing listening"
                echo "  [FIX] Start the backend service"
            fi
        fi
    else
        echo "  [FAIL] No proxy_pass directive in nginx config"
        FAIL=$((FAIL + 1))
        echo "  [FIX] Add proxy_pass to $SERVER_CONF"
    fi
else
    warn "No nginx config found — skipping proxy_pass check"
fi
echo ""

# --- CORS Configuration ---
echo "15. CORS Configuration"

CORS_ORIGINS=""
if [ -f "server/.env" ]; then
    CORS_ORIGINS=$(grep '^CORS_ORIGINS=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
fi

if [ -n "$CORS_ORIGINS" ]; then
    echo "  [INFO] CORS_ORIGINS: $CORS_ORIGINS"

    # Check for wildcard (permissive but works)
    if echo "$CORS_ORIGINS" | grep -q '\*'; then
        echo "  [WARN] CORS uses wildcard '*' — works but less secure"
        WARN=$((WARN + 1))
    else
        # Extract parent domain from nginx config
        SERVER_CONF="/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf"
        if [ -f "$SERVER_CONF" ]; then
            proj_domain=$(grep 'server_name' "$SERVER_CONF" 2>/dev/null | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
            if [ -n "$proj_domain" ]; then
                # The parent domain is everything after the first dot in the project domain
                # e.g., round-robin-ladder.example.com -> example.com
                parent_domain=$(echo "$proj_domain" | sed 's/^[^.]*\.//')
                parent_origin="https://$parent_domain"

                echo "  [INFO] Project domain: $proj_domain"
                echo "  [INFO] Parent origin: $parent_origin"

                if echo "$CORS_ORIGINS" | grep -qF "$parent_origin"; then
                    echo "  [PASS] Parent origin $parent_origin is in CORS_ORIGINS"
                    PASS=$((PASS + 1))
                else
                    echo "  [FAIL] Parent origin $parent_origin is NOT in CORS_ORIGINS"
                    echo "  [INFO] Frontend at $parent_domain/$PROJECT_NAME/dist/ will fail CORS on Firefox"
                    echo "  [FIX] Add $parent_origin to CORS_ORIGINS in server/.env"
                    FAIL=$((FAIL + 1))
                fi
            fi
        fi
    fi
else
    echo "  [WARN] CORS_ORIGINS not set in server/.env (defaults to '*')"
    WARN=$((WARN + 1))
fi
echo ""

# --- Nginx SSE Configuration ---
echo "16. Nginx SSE Configuration"

SERVER_CONF="/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf"
if [ -f "$SERVER_CONF" ]; then
    if grep -q "Connection 'upgrade'" "$SERVER_CONF"; then
        echo "  [FAIL] Nginx uses WebSocket Connection header — breaks SSE"
        echo "  [FIX] Change to: proxy_set_header Connection \"\";"
        FAIL=$((FAIL + 1))
    else
        echo "  [PASS] Connection header SSE-compatible"
        PASS=$((PASS + 1))
    fi

    if grep -q "proxy_read_timeout" "$SERVER_CONF"; then
        echo "  [PASS] SSE timeout configured"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] No proxy_read_timeout — SSE connections will timeout after 60s"
        echo "  [FIX] Add: proxy_read_timeout 86400; proxy_send_timeout 86400;"
        FAIL=$((FAIL + 1))
    fi
else
    warn "No nginx config found — cannot check SSE configuration"
fi
echo ""

# --- Client Config Strings ---
echo "17. Client Config Strings"

# Read API keys from server/.env
ADMIN_KEY=""
USER_KEY=""
if [ -f "server/.env" ]; then
    ADMIN_KEY=$(grep '^ADMIN_API_KEY=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
    USER_KEY=$(grep '^USER_API_KEY=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
fi

if [ -f "/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf" ]; then
    echo "  [INFO] Subdomain: ${PROJECT_NAME}.${DOMAIN}"
    echo ""
    echo "    Admin:"
    echo "      https://$DOMAIN/$PROJECT_NAME/dist/?config=1&server=https://${PROJECT_NAME}.${DOMAIN}&key=$ADMIN_KEY"
    echo ""
    echo "    User:"
    echo "      https://$DOMAIN/$PROJECT_NAME/dist/?config=1&server=https://${PROJECT_NAME}.${DOMAIN}&key=$USER_KEY"
    echo ""
    echo "    View:"
    echo "      https://$DOMAIN/$PROJECT_NAME/dist/"
    echo ""
else
    echo "  [FAIL] No config found in /etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf - cannot generate config strings"
    FAIL=$((FAIL + 1))
fi
echo ""

# --- Suggestions ---
if [ $FAIL -gt 0 ]; then
    echo "SUGGESTIONS:"
    SERVER_CONF="/etc/nginx/sites-available/${PROJECT_NAME}.${DOMAIN}.conf"
    if [ -f "$SERVER_CONF" ]; then
        proj_domain=$(grep 'server_name' "$SERVER_CONF" 2>/dev/null | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
        if [ -n "$proj_domain" ]; then
            # Check if config is enabled
            ENABLED_LINK="/etc/nginx/sites-enabled/${PROJECT_NAME}.${DOMAIN}.conf"
            if [ ! -L "$ENABLED_LINK" ]; then
                echo "  - Nginx config not enabled: sudo ln -s $SERVER_CONF /etc/nginx/sites-enabled/"
                echo "  - Then reload nginx: sudo systemctl reload nginx"
            fi
            if ! certbot certificates 2>/dev/null | grep -q "$proj_domain"; then
                echo "  - No SSL cert: sudo certbot --nginx -d $proj_domain"
            fi
            if ! grep -q 'listen 443 ssl' "$SERVER_CONF" 2>/dev/null; then
                echo "  - SSL not in nginx: sudo certbot --nginx -d $proj_domain"
            fi
            # CORS fix suggestion
            parent_domain=$(echo "$proj_domain" | sed 's/^[^.]*\.//')
            if [ -f "server/.env" ]; then
                env_cors=$(grep '^CORS_ORIGINS=' server/.env 2>/dev/null | cut -d= -f2)
                if ! echo "$env_cors" | grep -qF "https://$parent_domain"; then
                    echo "  - CORS: add https://$parent_domain to CORS_ORIGINS in server/.env"
                fi
            fi
            # SSE fix suggestion
            if [ -f "$SERVER_CONF" ]; then
                if grep -q "Connection 'upgrade'" "$SERVER_CONF"; then
                    echo "  - SSE: fix nginx Connection header (run deploy/update.sh or fix manually)"
                fi
                if ! grep -q "proxy_read_timeout" "$SERVER_CONF"; then
                    echo "  - SSE: add proxy_read_timeout 86400 to nginx config"
                fi
            fi
        fi
    fi
    # Backend not running
    echo "  - Start backend: sudo systemctl start $PROJECT_NAME"
    echo "  - Check status: sudo systemctl status $PROJECT_NAME"
    echo ""
fi

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
