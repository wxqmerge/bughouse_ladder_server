#!/bin/bash
# Shared helpers for protected API-key storage.

LADDER_SECRET_DIR="${LADDER_SECRET_DIR:-/etc/bughouse-ladder}"
LADDER_SECRET_GROUP="${LADDER_SECRET_GROUP:-bughouse-ladder}"

ladder_run_as_root() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

ladder_secret_file_for() {
    printf '%s/%s.env' "$LADDER_SECRET_DIR" "$1"
}

ladder_read_env_value() {
    local var="$1"
    shift

    local file value
    for file in "$@"; do
        [ -f "$file" ] || continue

        value=""
        if [ -r "$file" ]; then
            value=$(grep "^${var}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r\n')
        elif sudo -n true >/dev/null 2>&1; then
            value=$(sudo -n grep "^${var}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r\n')
        fi

        if [ -n "$value" ]; then
            printf '%s' "$value"
            return 0
        fi
    done

    return 1
}

ladder_has_env_value() {
    ladder_read_env_value "$@" >/dev/null 2>&1
}

ladder_prepare_secret_dir() {
    if getent group "$LADDER_SECRET_GROUP" >/dev/null 2>&1; then
        ladder_run_as_root install -d -m 750 -o root -g "$LADDER_SECRET_GROUP" "$LADDER_SECRET_DIR"
    else
        ladder_run_as_root install -d -m 700 -o root -g root "$LADDER_SECRET_DIR"
    fi
}

ladder_write_secret_file() {
    local secret_file="$1"
    local admin_key="$2"
    local user_key="$3"
    local tmp_file

    if [ -z "$admin_key" ] || [ -z "$user_key" ]; then
        echo "Error: both admin and user API keys are required." >&2
        return 1
    fi

    umask 077
    tmp_file=$(mktemp)
    printf 'ADMIN_API_KEY=%s\nUSER_API_KEY=%s\n' "$admin_key" "$user_key" > "$tmp_file"

    ladder_prepare_secret_dir
    if getent group "$LADDER_SECRET_GROUP" >/dev/null 2>&1; then
        chmod 640 "$tmp_file"
        ladder_run_as_root install -m 640 -o root -g "$LADDER_SECRET_GROUP" "$tmp_file" "$secret_file"
    else
        chmod 600 "$tmp_file"
        ladder_run_as_root install -m 600 -o root -g root "$tmp_file" "$secret_file"
    fi

    rm -f "$tmp_file"
}

ladder_remove_legacy_keys() {
    local env_file="$1"
    [ -f "$env_file" ] || return 0

    ladder_run_as_root sed -i '/^ADMIN_API_KEY=/d; /^USER_API_KEY=/d' "$env_file"
}

ladder_ensure_environment_file() {
    local service_file="$1"
    local env_file="$2"
    local marker="EnvironmentFile=${env_file}"
    local tmp_file

    [ -f "$service_file" ] || return 1
    [ -f "$env_file" ] || return 1

    if grep -qxF "$marker" "$service_file" 2>/dev/null; then
        return 0
    fi

    tmp_file=$(mktemp)
    awk -v insert_line="$marker" 'BEGIN { inserted = 0 }
        !inserted && /^ExecStart=/ {
            print insert_line
            inserted = 1
        }
        { print }
    ' "$service_file" > "$tmp_file"

    if grep -qxF "$marker" "$tmp_file" 2>/dev/null; then
        ladder_run_as_root cp "$tmp_file" "$service_file"
        ladder_run_as_root systemctl daemon-reload >/dev/null 2>&1 || true
        rm -f "$tmp_file"
        return 0
    fi

    rm -f "$tmp_file"
    return 1
}
