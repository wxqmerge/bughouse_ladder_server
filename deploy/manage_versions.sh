#!/bin/bash

# Multi-Version Management Script for Chess Ladder
# Designed for use on a production Linux server with Nginx

INSTANCES_DIR="./instances"
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
TEMPLATE_FILE="./deploy/nginx/subdomain.conf.template"
HOSTNAME=$(hostname -f 2>/dev/null || hostname)

usage() {
    echo "Usage: $0 {add|remove|list} [args]"
    echo "  add <version_name> <port>   - Create a new version instance and Nginx config"
    echo "  remove <version_name>       - Remove an instance and its Nginx config"
    echo "  list                        - List all managed instances"
    exit 1
}

case "$1" in
    add)
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Error: Missing arguments. Usage: $0 add <version_name> <port>"
            exit 1
        fi
        VERSION=$2
        PORT=$3
        SUBDOMAIN="${VERSION}.${HOSTNAME}"

        echo "Creating instance: $VERSION on port $PORT ($SUBDOMAIN)"

        # 1. Create instance directory
        mkdir -p "$INSTANCES_DIR/$VERSION"
        
        # 2. Generate Nginx config
        CONF_FILE="$NGINX_CONF_DIR/$SUBDOMAIN.conf"
        sed "s/{{SUBDOMAIN}}/$SUBDOMAIN/g; s/{{PORT}}/$PORT/g" "$TEMPLATE_FILE" > "$CONF_FILE"

        # 3. Enable Nginx config
        ln -s "$CONF_FILE" "$NGINX_ENABLED_DIR/"

        # 4. Reload Nginx
        nginx -t && systemctl reload nginx

        echo "------------------------------------------------------------"
        echo "SUCCESS: Instance $VERSION is configured."
        echo "Next Steps:"
        echo "1. Start the backend for this version:"
        echo "   cd $INSTANCES_DIR/$VERSION && PORT=$PORT node dist/index.js"
        echo "2. Secure the subdomain with SSL:"
        echo "   sudo certbot --nginx -d $SUBDOMAIN"
        echo "------------------------------------------------------------"
        ;;

    remove)
        if [ -z "$2" ]; then
            echo "Error: Missing version name. Usage: $0 remove <version_name>"
            exit 1
        fi
        VERSION=$2
        SUBDOMAIN="${VERSION}.${HOSTNAME}"
        CONF_FILE="$NGINX_CONF_DIR/$SUBDOMAIN.conf"

        echo "Removing instance: $VERSION"

        # 1. Remove Nginx config
        rm -f "$NGINX_ENABLED_DIR/$SUBDOMAIN.conf"
        rm -f "$CONF_FILE"

        # 2. Reload Nginx
        nginx -t && systemctl reload nginx

        # 3. Remove instance directory
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
