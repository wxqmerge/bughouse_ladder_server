#!/bin/bash
# Move API keys from world-readable server/.env into a root-only EnvironmentFile.
# Run from an instance directory, e.g.:
#   cd /var/www/html/bughouse-ladder-app
#   sudo bash ./deploy/secure-env.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$(dirname "$SCRIPT_DIR")"
SERVICE="$(basename "$DIR")"

source "$SCRIPT_DIR/ladder-env.sh"

ENV_FILE="$DIR/server/.env"
SECRET_FILE="$(ladder_secret_file_for "$SERVICE")"
SERVICE_FILE="/etc/systemd/system/${SERVICE}.service"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found."
    exit 1
fi

TARGET_USER="${1:-${SUDO_USER:-}}"
if [ -n "$TARGET_USER" ] && [ "$TARGET_USER" != "root" ]; then
    ladder_run_as_root groupadd -f "$LADDER_SECRET_GROUP"
    if ! id -nG "$TARGET_USER" | grep -qw "$LADDER_SECRET_GROUP"; then
        ladder_run_as_root usermod -aG "$LADDER_SECRET_GROUP" "$TARGET_USER"
        echo "Added $TARGET_USER to $LADDER_SECRET_GROUP. Open a new login shell for it to take effect."
    fi
fi

ADMIN_KEY=$(ladder_read_env_value ADMIN_API_KEY "$SECRET_FILE" "$ENV_FILE" || true)
USER_KEY=$(ladder_read_env_value USER_API_KEY "$SECRET_FILE" "$ENV_FILE" || true)

if [ -z "$ADMIN_KEY" ] || [ -z "$USER_KEY" ]; then
    echo "Error: ADMIN_API_KEY and USER_API_KEY must exist in $ENV_FILE before migration."
    exit 1
fi

umask 077
BACKUP="$ENV_FILE.pre-secret.$(date +%Y%m%d%H%M%S)"
ladder_run_as_root cp -a "$ENV_FILE" "$BACKUP"
ladder_run_as_root chmod 600 "$BACKUP"

ladder_write_secret_file "$SECRET_FILE" "$ADMIN_KEY" "$USER_KEY"
ladder_remove_legacy_keys "$ENV_FILE"
ladder_run_as_root chmod 640 "$ENV_FILE"

if [ -f "$SERVICE_FILE" ]; then
    ladder_ensure_environment_file "$SERVICE_FILE" "$ENV_FILE" || echo "  WARNING: could not configure $ENV_FILE"
    ladder_ensure_environment_file "$SERVICE_FILE" "$SECRET_FILE" || echo "  WARNING: could not configure $SECRET_FILE"
    ladder_run_as_root systemctl daemon-reload
    if ladder_run_as_root systemctl restart "$SERVICE"; then
        echo "Service restarted: $SERVICE"
    else
        echo "Warning: keys were migrated, but service restart failed."
        echo "Fix: sudo systemctl restart $SERVICE"
    fi
else
    echo "Warning: $SERVICE_FILE not found; keys migrated without updating systemd."
fi

echo "Secrets stored: $SECRET_FILE"
echo "Legacy backup:  $BACKUP"
echo "server/.env permissions: 640, key lines removed"
