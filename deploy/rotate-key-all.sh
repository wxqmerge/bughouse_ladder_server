#!/bin/bash
# Rotate API keys across ALL ladder instances on the server
# Run from: /var/www/html/
# Usage: ./deploy/rotate-key-all.sh [new-admin-key] [new-user-key]
#
# Detects all matching instances by git remote origin, then
# rotates both ADMIN_API_KEY and USER_API_KEY in each server/.env
# and restarts. Works for any project that has a git repo and server/.env.

BASE="/var/www/html"
FLAGS="$@"
OK=0
FAIL=0
SKIP=0
UPDATED=()

# Detect the project repo from the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CALLER_REMOTE=$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null)
CALLER_REPO=$(basename "$CALLER_REMOTE" .git)

if [ -z "$CALLER_REPO" ]; then
    echo "Error: could not detect git repo from $SCRIPT_DIR"
    echo "This script must be run from within a project directory."
    exit 1
fi

# Generate or use provided keys
if [ -n "$1" ]; then
    NEW_ADMIN_KEY="$1"
else
    NEW_ADMIN_KEY=$(openssl rand -hex 48)
fi

if [ -n "$2" ]; then
    NEW_USER_KEY="$2"
else
    NEW_USER_KEY=$(openssl rand -hex 48)
fi

echo "========================================"
echo "  Rotate API Keys — ALL $CALLER_REPO Instances"
echo "  Base: $BASE"
echo "  Admin: $NEW_ADMIN_KEY"
echo "  User:  $NEW_USER_KEY"
echo "========================================"
echo ""

for dir in "$BASE"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")

    # Must be a git repository
    if ! git -C "$dir" remote -v &>/dev/null; then
        echo "  ⊘ $name — not a git repo, skipping"
        SKIP=$((SKIP + 1))
        echo ""
        continue
    fi

    # Detect repo from remote origin — must match calling project
    remote=$(git -C "$dir" remote get-url origin 2>/dev/null)
    repo=$(basename "$remote" .git)

    if [ "$repo" != "$CALLER_REPO" ]; then
        echo "  ⊘ $name — different repo ($repo), skipping"
        SKIP=$((SKIP + 1))
        echo ""
        continue
    fi

    ENV_FILE="$dir/server/.env"
    if [ ! -f "$ENV_FILE" ]; then
        echo "  ✗ $name — $ENV_FILE not found, skipping"
        FAIL=$((FAIL + 1))
        echo ""
        continue
    fi

    # Update admin key
    if grep -q '^ADMIN_API_KEY=' "$ENV_FILE"; then
        sed -i "s/^ADMIN_API_KEY=.*/ADMIN_API_KEY=$NEW_ADMIN_KEY/" "$ENV_FILE"
    else
        echo "ADMIN_API_KEY=$NEW_ADMIN_KEY" >> "$ENV_FILE"
    fi

    # Update user key
    if grep -q '^USER_API_KEY=' "$ENV_FILE"; then
        sed -i "s/^USER_API_KEY=.*/USER_API_KEY=$NEW_USER_KEY/" "$ENV_FILE"
    else
        echo "USER_API_KEY=$NEW_USER_KEY" >> "$ENV_FILE"
    fi

    # Restart the service
    SERVICE="$name"
    if sudo systemctl restart "$SERVICE" 2>/dev/null; then
        echo "  ✓ $name — keys updated, service restarted"
    else
        echo "  ⚠ $name — keys updated, but service restart failed"
        echo "    Fix: sudo systemctl restart $SERVICE"
    fi
    UPDATED+=("$name")
    OK=$((OK + 1))
    echo ""
done

echo "========================================"
echo "  Done: $OK OK, $FAIL failed, $SKIP skipped"
echo "========================================"
echo ""

# Print config URLs for all updated instances
DOMAIN="chess4.us"
if [ ${#UPDATED[@]} -gt 0 ]; then
    echo "========================================"
    echo "  Config URLs"
    echo "  Generated: $(date '+%Y-%m-%d %H:%M')"
    echo "========================================"
    echo ""

    for name in "${UPDATED[@]}"; do
        proj_domain="$name.$DOMAIN"
        parent_domain="$DOMAIN"

        # Try to find domain from nginx config
        for conf in /etc/nginx/sites-available/${name}.*.conf; do
            if [ -f "$conf" ]; then
                proj_domain=$(grep 'server_name' "$conf" 2>/dev/null | head -1 | tr -d '\r\n\t' | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
                parent_domain=$(echo "$proj_domain" | tr -d '[:space:]' | sed 's/^[^.]*\.//')
                break
            fi
        done

        echo "--- $name ---"
        echo "  Admin:  https://$parent_domain/$name/dist/?key=$NEW_ADMIN_KEY"
        echo "  User:   https://$parent_domain/$name/dist/?key=$NEW_USER_KEY"
        echo "  View:   https://$parent_domain/$name/dist/"
        echo ""
    done
fi

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
