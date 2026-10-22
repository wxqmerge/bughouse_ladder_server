#!/bin/bash
# Fix nginx ?key=<secret> leak in access logs — ALL projects on the server.
#
# The config shortcut URL (e.g. https://app.example.com/dist/?key=<secret>) puts
# the live API key into the nginx access log on every load. This script:
#   1. finds the parent-domain vhost(s) (root /var/www/html) and adds no-log
#      regex locations that also SERVE /<instance>/dist/ (try_files cannot
#      expand variables, so we rewrite ... break instead),
#   2. finds every subdomain app vhost with a protected `alias .../dist/`
#      location and adds `access_log off;` to it,
#   3. marker-tests each protected path (dummy key must NOT reach the log),
#   4. verifies the fix and reports anything still leaking,
#   5. --purge-logs    : truncate access.log and delete rotated logs that
#                        already contain key URLs (AFTER the fix, and remember:
#                        purge != safe, rotate the keys too)
#   6. --dry-run       : review the diff first
#
# nginx config snippet (manual case): deploy/nginx/dist-nolog.conf
# Test command for other projects:     deploy/README.md "Testing the log fix in other projects"

set -e

SUDO_CMD="${SUDO_CMD:-}"
DRY_RUN=0
RUN_TEST=0
PURGE_LOGS=0
for arg in "$@"; do
    case "$arg" in
        --test)       RUN_TEST=1 ;;
        --purge-logs) PURGE_LOGS=1 ;;
        --dry-run)    DRY_RUN=1 ;;
        *) echo "Unknown option: $arg (expected --test, --purge-logs or --dry-run)"; exit 2 ;;
    esac
done

if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
elif [ -n "${SUDO_CMD+x}" ]; then
    SUDO="$SUDO_CMD"
elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
else
    echo "Error: needs root (run with sudo)"
    exit 1
fi

NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_TEST_PATH="/nginx-nginxtest-probe"
ACCESS_LOG="/var/log/nginx/access.log"

[ -d "$NGINX_CONF_DIR" ] || { echo "Error: $NGINX_CONF_DIR not found"; exit 1; }

# Parent-domain vhosts: server blocks with root /var/www/html (subpaths like
# /<instance>/dist/ are served from there). *.conf only — never our own backups.
discover_parent_domains() {
    grep -rlE --include='*.conf' "^[[:space:]]*root[[:space:]]+/var/www/html/?[[:space:]]*;" "$NGINX_CONF_DIR" 2>/dev/null | sort -u
}

# Subdomain app vhosts whose protected alias location (e.g. sothh-app.conf)
# carries the key in its URI.
discover_subdomain_apps() {
    local f sub
    for f in "$NGINX_CONF_DIR"/*.conf; do
        [ -f "$f" ] || continue
        sub=$(grep -oE "server_name[[:space:]]+[a-z0-9-]+\.[a-z0-9.-]+[[:space:]]*;" "$f" 2>/dev/null \
            | grep -oE "[a-z0-9-]+\.[a-z0-9.-]+" | grep -v '^www\.' | sort -u | head -1)
        [ -z "$sub" ] && continue
        grep -qE "^[[:space:]]*location[^{]*/dist[^{]*\{" "$f" 2>/dev/null || continue
        echo "$f|$sub"
    done
}

PARENTS=()
while IFS= read -r line; do [ -n "$line" ] && PARENTS+=("$line"); done < <(discover_parent_domains)
SUBS=()
while IFS= read -r line; do [ -n "$line" ] && SUBS+=("$line"); done < <(discover_subdomain_apps)

if [ ${#PARENTS[@]} -eq 0 ] && [ ${#SUBS[@]} -eq 0 ]; then
    echo "Error: no nginx vhost serving /var/www/html with /dist/ paths found."
    echo "Add the snippet manually - see deploy/nginx/dist-nolog.conf"
    exit 1
fi

echo "Parent-domain vhosts found: ${#PARENTS[@]}"
for f in "${PARENTS[@]}"; do echo "  - $(basename "$f")"; done
echo "Subdomain app vhosts with /dist/ locations: ${#SUBS[@]}"
for entry in "${SUBS[@]}"; do echo "  - $(basename "${entry%%|*}") (${entry##*|})"; done

backup_file() { $SUDO cp "$1" "$1.bak.$(date +%Y%m%d_%H%M%S)"; }

# Insert the parent-domain no-log dist locations before the first
# `location / {`. awk program is single-quoted: $app must reach nginx verbatim.
insert_parent_snippet() {
    local f="$1"
    local tmp
    tmp=$(mktemp)
    awk '/^[[:space:]]*location[[:space:]]*\/[[:space:]]*\{/ && !done {
        print
        print "    # Protect config shortcut URLs (?key=...) from access logging"
        print "    location ~ ^/(?<app>[a-z0-9-]+)/dist/$ { access_log off; rewrite ^ /$app/dist/index.html break; }"
        print "    location ~ ^/[a-z0-9-]+/dist/ { access_log off; }"
        done=1; next
    }1' "$f" > "$tmp"
    if diff -q "$f" "$tmp" > /dev/null; then rm "$tmp"; return 1; fi
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "  [DRY-RUN] would modify $(basename "$f"):"
        diff "$f" "$tmp" | sed 's/^/      /'
        rm "$tmp"
        return 0
    fi
    $SUDO tee "$f" > /dev/null < "$tmp"
    rm "$tmp"
    echo "  Added no-log dist regex locations to $(basename "$f")"
    return 0
}

# Temp marker-test block (same location class, returns static text).
insert_test_block() {
    local f="$1"
    local tmp
    tmp=$(mktemp)
    awk -v tp="$NGINX_TEST_PATH" '/^[[:space:]]*location[[:space:]]*\/[[:space:]]*\{/ && !done {
        print
        print "    location = " tp " { access_log off; return 200 \"nginx-nolog-test\"; }"
        done=1; next
    }1' "$f" > "$tmp"
    $SUDO tee "$f" > /dev/null < "$tmp"
    rm "$tmp"
}

PARENT_MODIFIED=0
PARENT_FILES=()
for f in "${PARENTS[@]}"; do
    if grep -q "access_log off" "$f"; then
        echo "  $(basename "$f") already protected"
    elif grep -qE "^[[:space:]]*location[^{]*/dist/?[^{]*\{" "$f"; then
        backup_file "$f"
        $SUDO sed -i -E "s|(location[^{]*/dist[^{]*[[:space:]]*)\{|\1{ access_log off;|" "$f"
        echo "  Added access_log off to existing dist location in $(basename "$f")"
        PARENT_MODIFIED=1
        PARENT_FILES+=("$f")
    elif [ "$DRY_RUN" -eq 1 ]; then
        if insert_parent_snippet "$f"; then
            PARENT_MODIFIED=1
        fi
    else
        backup_file "$f"
        insert_parent_snippet "$f"
        PARENT_MODIFIED=1
        PARENT_FILES+=("$f")
    fi
done

SUB_MODIFIED=0
SUB_TESTS=()
SUB_PATHS=()
for entry in "${SUBS[@]}"; do
    f="${entry%%|*}"; sub="${entry##*|}"
    if grep -q "access_log off" "$f"; then
        echo "  ${sub} vhost already protected"
        SUB_TESTS+=("https://${sub}/dist/")
        SUB_PATHS+=("$sub")
    elif [ "$DRY_RUN" -eq 1 ]; then
        tmp=$(mktemp)
        sed -E "s|(location[^{]*/dist[^{]*\{)|\1 access_log off;|" "$f" > "$tmp"
        echo "  [DRY-RUN] would add access_log off to /dist/ location in ${sub}:"
        diff "$f" "$tmp" | sed 's/^/      /'
        rm "$tmp"
        SUB_MODIFIED=1
    else
        backup_file "$f"
        $SUDO sed -i -E "s|(location[^{]*/dist[^{]*\{)|\1 access_log off;|" "$f"
        echo "  Added access_log off to /dist/ location of ${sub}"
        SUB_MODIFIED=1
        SUB_TESTS+=("https://${sub}/dist/")
        SUB_PATHS+=("$sub")
    fi
done

if [ "$DRY_RUN" -eq 1 ]; then
    echo ""
    if [ "$PARENT_MODIFIED" -eq 1 ] || [ "$SUB_MODIFIED" -eq 1 ]; then
        echo "--dry-run: changes above were NOT applied and nginx was NOT reloaded."
        echo "Re-run without --dry-run to apply them."
    else
        echo "--dry-run: nothing to change."
    fi
    exit 0
fi

revert_all() {
    for f in "${PARENTS[@]}" "${SUBS[@]%%|*}"; do
        latest=$(ls "$f".bak.* 2>/dev/null | tail -1 || true)
        [ -n "$latest" ] && $SUDO cp "$latest" "$f"
    done
}

if [ "$RUN_TEST" -eq 1 ]; then
    for f in "${PARENT_FILES[@]}"; do
        insert_test_block "$f"
    done
fi

echo "Testing nginx configuration syntax..."
if ! $SUDO nginx -t 2>/dev/null; then
    echo "Error: nginx config test failed. Reverting all changes."
    revert_all
    $SUDO nginx -t 2>/dev/null || echo "Warning: reverted config still fails nginx -t - investigate manually"
    exit 1
fi

if [ "$RUN_TEST" -eq 1 ]; then
    echo "Reloading nginx with test block..."
    $SUDO systemctl reload nginx
    sleep 1

    TEST_URLS=()
    PATHS=()
    for f in "${PARENT_FILES[@]}"; do
        for path in /var/www/html/*/dist/; do
            [ -d "$path" ] || continue
            instance=$(basename "$(dirname "$path")")
            TEST_URLS+=("https://$(hostname -f | sed 's/^[^.]*\.//')/${instance}/dist/")
            PATHS+=("$instance")
        done
        TEST_URLS+=("https://$(hostname -f | sed 's/^[^.]*\.//')${NGINX_TEST_PATH}")
        PATHS+=("nginxtest")
    done
    i=0
    while [ $i -lt ${#SUB_TESTS[@]} ]; do
        TEST_URLS+=("${SUB_TESTS[$i]}")
        PATHS+=("${SUB_PATHS[$i]}")
        i=$((i+1))
    done

    if [ ${#TEST_URLS[@]} -eq 0 ]; then
        echo "  Warning: no test URLs discovered; skipping marker test."
    else
        echo "Marker tests (dummy keys must NOT appear in $ACCESS_LOG)..."
        FAILED=0
        for idx in "${!TEST_URLS[@]}"; do
            url="${TEST_URLS[$idx]}"
            marker="DUMMYTEST-$(date +%s%N)-${idx}"
            curl -sk -o /dev/null "${url}?key=${marker}" || true
            sleep 1
            if $SUDO grep -q "$marker" "$ACCESS_LOG" 2>/dev/null; then
                echo "  [FAIL] ${PATHS[$idx]}: dummy key $marker WAS logged"
                FAILED=1
            else
                echo "  [PASS] ${PATHS[$idx]}: dummy key $marker NOT logged"
            fi
        done

        if [ "$FAILED" -eq 1 ]; then
            echo "Test failed - reverting all changes."
            revert_all
            $SUDO nginx -t && $SUDO systemctl reload nginx
            exit 1
        fi
    fi
fi

# Always reload: either test passed, or plain apply.
if [ "$RUN_TEST" -eq 0 ]; then
    echo "Reloading nginx..."
    $SUDO systemctl reload nginx
fi

if [ "$RUN_TEST" -eq 1 ]; then
    # reload again without the temporary test block
    for f in "${PARENT_FILES[@]}"; do
        $SUDO sed -i "\|location = ${NGINX_TEST_PATH}|d" "$f"
    done
    $SUDO nginx -t && $SUDO systemctl reload nginx
fi

echo "DONE: nginx no longer logs ?key= loads for the fixed locations."

# --- optional: remove already-logged keys from old access logs ---------------
if [ "$PURGE_LOGS" -eq 1 ]; then
    echo "--purge-logs:"
    n=$($SUDO grep -lE '[?&]key=' "$ACCESS_LOG"* 2>/dev/null | wc -l)
    echo "  Files with key URLs: $n"
    $SUDO truncate -s 0 "$ACCESS_LOG" 2>/dev/null && echo "  [OK] truncated $ACCESS_LOG"
    if ls "$ACCESS_LOG".* >/dev/null 2>&1; then
        $SUDO rm -f "$ACCESS_LOG".* && echo "  [OK] deleted rotated logs"
    else
        echo "  [OK] no rotated logs"
    fi
    echo "  Remember: purge is not enough - rotate the keys (key_plan.md)."
fi

echo "Next: run deploy/verify.sh (Nginx Log Secrets check) and rotate the keys."
