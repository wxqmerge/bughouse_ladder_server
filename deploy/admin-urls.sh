#!/bin/bash
# Print admin config URLs for all ladder instances
# Run from: /var/www/html/
# Usage: ./deploy/admin-urls.sh

BASE="/var/www/html"
DOMAIN="chess4.us"

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

    # Read admin key from .env
    env_file="$dir/server/.env"
    admin_key=""
    if [ -f "$env_file" ]; then
        admin_key=$(grep '^ADMIN_API_KEY=' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')
    fi

    if [ -z "$admin_key" ]; then
        echo "$name: NO ADMIN KEY SET"
        continue
    fi

    # Find domain from nginx config
    proj_domain="$name.$DOMAIN"
    for conf in /etc/nginx/sites-available/${name}.*.conf; do
        if [ -f "$conf" ]; then
            proj_domain=$(grep 'server_name' "$conf" 2>/dev/null | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
            break
        fi
    done

    # Find parent domain from nginx config
    parent_domain="$DOMAIN"
    for conf in /etc/nginx/sites-available/${name}.*.conf; do
        if [ -f "$conf" ]; then
            parent_domain=$(echo "$proj_domain" | sed 's/^[^.]*\.//')
            break
        fi
    done

    echo "--- $name ---"
    echo "  Domain: $proj_domain"
    echo ""
    echo "  Admin:"
    echo "    https://$parent_domain/$name/dist/?config=1&server=https://$proj_domain&key=$admin_key"
    echo ""
    echo "  View:"
    echo "    https://$parent_domain/$name/dist/"
    echo ""
done
