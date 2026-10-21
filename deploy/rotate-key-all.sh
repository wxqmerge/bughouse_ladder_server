#!/bin/bash
# Rotate API keys across ALL ladder instances on the server
# Run from: /var/www/html/
# Usage:
#   ROTATE_ADMIN_KEY=... ROTATE_USER_KEY=... ./deploy/rotate-key-all.sh
#   ./deploy/rotate-key-all.sh [new-admin-key] [new-user-key]
#
# If a protected /etc/bughouse-ladder/<instance>.env exists, keys are written
# there (root-only, mode 0600). Otherwise the legacy server/.env is updated.
# Generated keys are written to a private report file; set
# ROTATE_REPORT_TO_STDOUT=1 to also print them.

BASE="/var/www/html"
OK=0
FAIL=0
SKIP=0
UPDATED=()

umask 077
REPORT_FILE="$HOME/bughouse-ladder-rotated-keys-$(date +%Y%m%d%H%M%S).txt"
: > "$REPORT_FILE"

# Detect the project repo from the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ladder-env.sh"
CALLER_REMOTE=$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null)
CALLER_REPO=$(basename "$CALLER_REMOTE" .git)

if [ -z "$CALLER_REPO" ]; then
    echo "Error: could not detect git repo from $SCRIPT_DIR"
    echo "This script must be run from within a project directory."
    exit 1
fi

NEW_ADMIN_KEY="${ROTATE_ADMIN_KEY:-${1:-}}"
NEW_USER_KEY="${ROTATE_USER_KEY:-${2:-}}"

if [ -z "$NEW_ADMIN_KEY" ] && [ -t 0 ]; then
    read -rsp "New admin key (Enter to generate): " NEW_ADMIN_KEY
    echo ""
fi
if [ -z "$NEW_USER_KEY" ] && [ -t 0 ]; then
    read -rsp "New user key (Enter to generate): " NEW_USER_KEY
    echo ""
fi

if [ -z "$NEW_ADMIN_KEY" ]; then
    NEW_ADMIN_KEY=$(openssl rand -hex 48)
fi

if [ -z "$NEW_USER_KEY" ]; then
    NEW_USER_KEY=$(openssl rand -hex 48)
fi

echo "========================================"
echo "  Rotate API Keys — ALL $CALLER_REPO Instances"
echo "  Base: $BASE"
echo "  Report: $REPORT_FILE"
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
    SECRET_FILE="$(ladder_secret_file_for "$name")"

    if [ ! -f "$ENV_FILE" ]; then
        echo "  ✗ $name — $ENV_FILE not found, skipping"
        FAIL=$((FAIL + 1))
        echo ""
        continue
    fi

    if [ -f "$SECRET_FILE" ]; then
        if ladder_write_secret_file "$SECRET_FILE" "$NEW_ADMIN_KEY" "$NEW_USER_KEY" &&
           ladder_remove_legacy_keys "$ENV_FILE"; then
            echo "  ✓ $name — protected keys updated"
        else
            echo "  ✗ $name — protected key update failed"
            FAIL=$((FAIL + 1))
            echo ""
            continue
        fi
    else
        if grep -q '^ADMIN_API_KEY=' "$ENV_FILE"; then
            sed -i "s/^ADMIN_API_KEY=.*/ADMIN_API_KEY=$NEW_ADMIN_KEY/" "$ENV_FILE"
        else
            echo "ADMIN_API_KEY=$NEW_ADMIN_KEY" >> "$ENV_FILE"
        fi

        if grep -q '^USER_API_KEY=' "$ENV_FILE"; then
            sed -i "s/^USER_API_KEY=.*/USER_API_KEY=$NEW_USER_KEY/" "$ENV_FILE"
        else
            echo "USER_API_KEY=$NEW_USER_KEY" >> "$ENV_FILE"
        fi

        chmod 600 "$ENV_FILE" 2>/dev/null || true
        echo "  ✓ $name — legacy keys updated"
    fi

    # Restart the service
    SERVICE="$name"
    if sudo systemctl restart "$SERVICE" 2>/dev/null; then
        echo "  ✓ $name — service restarted"
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
if [ ${#UPDATED[@]} -gt 0 ]; then
    {
        echo "========================================"
        echo "  Config URLs"
        echo "  Generated: $(date '+%Y-%m-%d %H:%M')"
        echo "========================================"
        echo ""
        echo "ADMIN_API_KEY=$NEW_ADMIN_KEY"
        echo "USER_API_KEY=$NEW_USER_KEY"
        echo ""

        for name in "${UPDATED[@]}"; do
            proj_domain=""
            parent_domain=""
            for conf in /etc/nginx/sites-available/${name}.*.conf; do
                if [ -f "$conf" ]; then
                    proj_domain=$(grep 'server_name' "$conf" 2>/dev/null | head -1 | tr -d '\r\n\t' | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
                    parent_domain=$(echo "$proj_domain" | tr -d '[:space:]' | sed 's/^[^.]*\.//')
                    break
                fi
            done
            if [ -z "$proj_domain" ]; then
                echo "  ⊘ $name — no nginx config found, skipping"
                continue
            fi

            echo "--- $name ---"
            echo "  Admin:  https://$parent_domain/$name/dist/?key=$NEW_ADMIN_KEY"
            echo "  User:   https://$parent_domain/$name/dist/?key=$NEW_USER_KEY"
            echo "  View:   https://$parent_domain/$name/dist/"
            echo ""
        done
    } > "$REPORT_FILE"

    echo "Config URLs and new keys were written to:"
    echo "  $REPORT_FILE"
    echo "Delete it after copying the keys."

    if [ "${ROTATE_REPORT_TO_STDOUT:-0}" = "1" ]; then
        cat "$REPORT_FILE"
    fi
fi

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
