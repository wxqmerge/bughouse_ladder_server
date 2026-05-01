#!/bin/bash

# Multi-Version Management Script for Chess Ladder
# Designed for use on a production Linux server with Nginx

INSTANCES_DIR="./instances"
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
TEMPLATE_FILE="./deploy/nginx/subdomain.conf.template"

# Derive version name from current directory
VERSION=$(basename "$(pwd)")

# Domain from .env (falls back to hostname)
DOMAIN=""
if [ -f "server/.env" ]; then
    DOMAIN=$(grep '^DOMAIN=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
fi
if [ -z "$DOMAIN" ]; then
    DOMAIN=$(hostname -f 2>/dev/null || hostname)
fi

# Port from .env
PORT=""
if [ -f "server/.env" ]; then
    PORT=$(grep '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
fi
if [ -z "$PORT" ]; then
    echo "Error: PORT not set in server/.env"
    exit 1
fi

SUBDOMAIN="${VERSION}.${DOMAIN}"

usage() {
    echo "Usage: $0 {add|remove|list}"
    echo "  add       - Create a new version instance and Nginx config"
    echo "  remove    - Remove an instance and its Nginx config"
    echo "  list      - List all managed instances"
    exit 1
}

case "$1" in
    add)

        echo "Creating instance: $VERSION on port $PORT ($SUBDOMAIN)"

        # 1. Create instance directory
        mkdir -p "$INSTANCES_DIR/$VERSION"
        
        # 2. Generate Nginx config
        CONF_FILE="$NGINX_CONF_DIR/$SUBDOMAIN.conf"
        sed "s/{{SUBDOMAIN}}/$SUBDOMAIN/g; s/{{PORT}}/$PORT/g" "$TEMPLATE_FILE" > "$CONF_FILE"

        # 3. Enable Nginx config
        ln -s "$CONF_FILE" "$NGINX_ENABLED_DIR/"

        # 4. Generate systemd service file
        SVC_FILE="/etc/systemd/system/${VERSION}.service"
        if [ -f "$SVC_FILE" ]; then
            echo "  [WARN] Service file already exists: ${VERSION}.service"
        else
            cat > "$SVC_FILE" << EOF
[Unit]
Description=Bughouse Chess Ladder - $VERSION
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$(pwd)/instances/$VERSION
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
            echo "  Created service file: ${VERSION}.service"
        fi

        # 5. Reload Nginx
        nginx -t && systemctl reload nginx

        # 6. Enable and start the service
        systemctl daemon-reload
        systemctl enable "$VERSION"
        systemctl start "$VERSION"
        echo "  Service started: $VERSION"

        echo "------------------------------------------------------------"
        echo "SUCCESS: Instance $VERSION is configured."
        echo "  Subdomain: $SUBDOMAIN"
        echo "  Port:      $PORT"
        echo "Next Steps:"
        echo "1. Secure the subdomain with SSL:"
        echo "   sudo certbot --nginx -d $SUBDOMAIN"
        echo "2. Check status:"
        echo "   sudo systemctl status $VERSION"
        echo "   sudo journalctl -u $VERSION -f"
        echo "------------------------------------------------------------"
        ;;

    remove)
        CONF_FILE="$NGINX_CONF_DIR/$SUBDOMAIN.conf"

        echo "Removing instance: $VERSION"

        # 1. Stop and disable service
        systemctl stop "$VERSION" 2>/dev/null
        systemctl disable "$VERSION" 2>/dev/null
        rm -f "/etc/systemd/system/${VERSION}.service"

        # 2. Remove Nginx config
        rm -f "$NGINX_ENABLED_DIR/$SUBDOMAIN.conf"
        rm -f "$CONF_FILE"

        # 3. Reload Nginx
        nginx -t && systemctl reload nginx

        # 4. Remove instance directory
        rm -rf "$INSTANCES_DIR/$VERSION"

        echo "SUCCESS: Instance $VERSION removed."
        ;;

    list)
        echo "Managed Instances:"
        echo "-----------------"
        ls "$INSTANCES_DIR" | while read -r dir; do
            echo "- $dir"
        done
        ;;

    *)
        usage
        ;;
esac
