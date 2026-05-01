#!/bin/bash

# Verify setup - checks everything without sudo
# Run: ./deploy/verify.sh

echo "========================================"
echo "  Chess Ladder - Verify Setup"
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
    echo "  [INFO] sites-available:"
    if [ -d /etc/nginx/sites-available ]; then
        ls /etc/nginx/sites-available/ 2>/dev/null | sed 's/^/    /'
    fi
    echo "  [INFO] sites-enabled:"
    if [ -d /etc/nginx/sites-enabled ]; then
        ls -la /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/    /'
    fi
else
    warn "nginx not installed"
fi
echo ""

# --- Systemd services ---
echo "7. Systemd services"
for svc in dev-ladder rel-ladder bughouse-ladder; do
    if systemctl list-unit-files "${svc}.service" 2>/dev/null | grep -q "${svc}.service"; then
        echo "  [INFO] Service file exists: ${svc}.service"
        if systemctl is-active "${svc}" 2>/dev/null | grep -q "active"; then
            echo "    [INFO] Status: running"
        else
            echo "    [WARN] Status: not running"
        fi
    fi
done
echo ""

# --- SSL certificates ---
echo "8. SSL certificates"
if command -v certbot > /dev/null 2>&1; then
    echo "  [INFO] Certbot certificates:"
    certbot certificates 2>/dev/null | grep -E "Domain|Path" | sed 's/^/    /'
else
    warn "certbot not installed"
fi
echo ""

# --- DNS ---
echo "9. DNS resolution"
for domain in dev-ladder.chess4.us rel.omen.com dev.omen.com; do
    if command -v dig > /dev/null 2>&1; then
        ip=$(dig +short "$domain" 2>/dev/null | head -1)
        if [ -n "$ip" ]; then
            echo "  [PASS] $domain -> $ip"
        else
            echo "  [FAIL] $domain -> no DNS record"
        fi
    elif command -v nslookup > /dev/null 2>&1; then
        ip=$(nslookup "$domain" 2>/dev/null | grep "Address" | tail -1 | awk '{print $2}')
        if [ -n "$ip" ]; then
            echo "  [PASS] $domain -> $ip"
        else
            echo "  [FAIL] $domain -> no DNS record"
        fi
    else
        echo "  [WARN] dig/nslookup not found, skipping DNS check"
        break
    fi
done
echo ""

# --- Sudo config ---
echo "10. Sudo configuration"
echo "  [INFO] Current user: $(whoami)"
echo "  [INFO] sudoers check:"
if sudo -n true 2>/dev/null; then
    echo "    [PASS] Passwordless sudo works"
else
    echo "    [FAIL] sudo requires password (will hang in SSH without TTY)"
    echo "    [FIX] Add this to /etc/sudoers.d/bughouse-ladder:"
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

# Also check systemd service files for their PORT
for svc_file in deploy/instances/*/\*.service; do
    if [ -f "$svc_file" ]; then
        svc_name=$(basename "$(dirname "$svc_file")")
        svc_port=$(grep '^Environment=PORT=' "$svc_file" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
        if [ -n "$svc_port" ]; then
            echo "  [INFO] $svc_name.service: PORT=$svc_port"
        fi
    fi
done

for port in $PORT 3001 3002; do
    if command -v ss > /dev/null 2>&1; then
        listener=$(ss -tlnp 2>/dev/null | grep ":$port " | head -1)
    elif command -v netstat > /dev/null 2>&1; then
        listener=$(netstat -tlnp 2>/dev/null | grep ":$port " | head -1)
    else
        listener=""
    fi
    if [ -n "$listener" ]; then
        echo "  [INFO] Port $port: IN USE ($listener)"
    else
        echo "  [INFO] Port $port: free"
    fi
done
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
