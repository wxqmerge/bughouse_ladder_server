#!/bin/bash
# Print admin config URLs for all ladder instances
# Run from: /var/www/html/
# Usage: ./deploy/admin-urls.sh

BASE="/var/www/html"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ladder-env.sh"

echo "========================================"
echo "  Admin Config URLs"
echo "  Generated: $(date '+%Y-%m-%d %H:%M')"
echo "========================================"
echo ""

for dir in "$BASE"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")

    # Skip non-ladder directories (ladders always have "ladder" in name)
    echo "$name" | grep -qi "ladder" || continue

    # Read admin key from protected key file or legacy .env
    env_file="$dir/server/.env"
    secret_file="$(ladder_secret_file_for "$name")"
    admin_key=$(ladder_read_env_value ADMIN_API_KEY "$secret_file" "$env_file" || true)

    if [ -z "$admin_key" ]; then
        echo "$name: NO ADMIN KEY SET"
        continue
    fi

    # Find domain from nginx config
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
        echo "$name: NO NGINX CONFIG, skipping"
        continue
    fi

    echo "--- $name ---"
    echo "  Domain: $proj_domain"
    echo ""
    echo "  Admin:"
    echo "    https://$parent_domain/$name/dist/?key=$admin_key"
    echo ""
    echo "  View:"
    echo "    https://$parent_domain/$name/dist/"
    echo ""
done
