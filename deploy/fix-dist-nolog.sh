#!/bin/bash
# Fix nginx access-log leakage of ?key=<secret> config URLs — ALL apps on this server.
#
# Config shortcuts hit the PARENT-domain vhost (https://parent/<app>/dist/?key=...),
# and the default nginx log_format records the full request URI, writing the live
# API key into access.log on every load.
#
# This script scans every site config, derives every parent domain in use
# (all projects: ladders, Hiker, future apps), and in each parent vhost inserts
# `access_log off;` into every location block serving /dist/ that lacks it.
#
# Steps:
#   1. Detect all parent domains from /etc/nginx/sites-available
#   2. Back up + edit each parent vhost's /dist/ locations
#   3. Validate with nginx -t (restores backups on failure), then reload
#   4. --test          : prove the fix with a dummy key marker per parent
#   5. --purge-logs    : truncate access.log and delete rotated logs that
#                        already contain logged keys
#
# Usage (any instance directory, or anywhere on the server):
#   sudo bash ./deploy/fix-dist-nolog.sh --dry-run     # review diff first
#   sudo bash ./deploy/fix-dist-nolog.sh
#   sudo bash ./deploy/fix-dist-nolog.sh --test --purge-logs
#   sudo bash ./deploy/fix-dist-nolog.sh --parent example.com     # extra parent
#
# Vhost/apps NOT following the <app>.<parent>.conf naming can still be covered:
#   pass them with --parent <domain>, or add access_log off manually —
#   see deploy/nginx/dist-nolog.conf
#
# Self-contained: only needs bash + standard tools (no other repo files).

set -u
umask 077

PURGE_LOGS=0
RUN_TEST=0
DRY_RUN=0
EXTRA_PARENTS=()
PENDING_PARENT=0
for arg in "$@"; do
    if [ $PENDING_PARENT -eq 1 ]; then
        EXTRA_PARENTS+=("$arg")
        PENDING_PARENT=0
        continue
    fi
    case "$arg" in
        --purge-logs) PURGE_LOGS=1 ;;
        --test)       RUN_TEST=1 ;;
        --dry-run)    DRY_RUN=1 ;;
        --parent)     PENDING_PARENT=1 ;;
        --parent=*)   EXTRA_PARENTS+=("${arg#--parent=}") ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
    esac
done
if [ $PENDING_PARENT -eq 1 ]; then
    echo "Error: --parent needs a value"
    exit 1
fi

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

SITES="${SITES_DIR:-/etc/nginx/sites-available}"
BASE="${BASE_DIR:-/var/www/html}"
STAMP=$(date +%Y%m%d%H%M%S)

echo "========================================"
echo "  Fix nginx ?key= access-log leakage (all apps)"
echo "  Sites:  $SITES"
echo "========================================"
echo ""

if [ ! -d "$SITES" ]; then
    echo "Error: $SITES not found"
    exit 1
fi

# --- 1. Detect parent domains + a representative instance per parent ---
# Instance configs look like <app>.<parent...>.conf (server_name <app>.<parent>).
# Every server_name token is classified:
#   >= 3 labels  -> instance subdomain; parent = everything after first label
#   == 2 labels  -> parent domain itself
PARENTS=()
declare -A REP_OF=()

add_parent() {
    local p="$1" rep="${2:-}"
    [ -n "$p" ] || return 0
    if [ -n "$rep" ] && [ -z "${REP_OF[$p]:-}" ]; then REP_OF[$p]="$rep"; fi
    local i
    for i in "${PARENTS[@]+"${PARENTS[@]}"}"; do
        [ "$i" = "$p" ] && return 0
    done
    PARENTS+=("$p")
}

while IFS=$'\t' read -r token rep; do
    labels=$(awk -F. '{print NF}' <<< "$token")
    if [ "$labels" -ge 3 ]; then
        parent="${token#*.}"
        add_parent "$parent" "${rep:-${token%%.*}}"
    elif [ "$labels" -eq 2 ]; then
        add_parent "$token"
    fi
done < <(awk '
    tolower($1) == "server_name" {
        for (i = 2; i <= NF; i++) {
            t = tolower($i); sub(/;$/, "", t); sub(/:.*/, "", t)
            if (t ~ /\./ && t !~ /^\*/) print t
        }
    }
' "$SITES"/*.conf 2>/dev/null | sort -u | awk '{
    tok = $1
    rep = ""
    n = split(tok, parts, ".")
    if (n >= 3 && parts[1] != "www") rep = parts[1]
    print tok "\t" rep
}')

for p in "${EXTRA_PARENTS[@]+"${EXTRA_PARENTS[@]}"}"; do
    lp=$(echo "$p" | tr '[:upper:]' '[:lower:]' | sed 's/[;:].*//')
    labels=$(awk -F. '{print NF}' <<< "$lp")
    if [ "$labels" -ge 3 ]; then
        add_parent "${lp#*.}"
    else
        add_parent "$lp"
    fi
done

if [ ${#PARENTS[@]} -eq 0 ]; then
    echo "Error: no parent domains detected in $SITES."
    echo "Use --parent <domain> to specify one."
    exit 1
fi
echo "Parent domains detected: ${PARENTS[*]}"
echo ""

# --- 2. Resolve parent vhost files (server_name contains the exact parent token) ---
declare -a PARENT_FILES=()
declare -a PARENT_OF_FILE=()
for parent in "${PARENTS[@]}"; do
    found=""
    while IFS= read -r f; do
        [ -n "$f" ] || continue
        found=1
        PARENT_FILES+=("$f")
        PARENT_OF_FILE+=("$parent")
    done < <(awk -v d="$parent" '
        FNR == 1 { hit = 0 }
        tolower($1) == "server_name" {
            for (i = 2; i <= NF; i++) {
                t = $i; sub(/;$/, "", t)
                if (tolower(t) == tolower(d)) hit = 1
            }
        }
        hit { print FILENAME; exit }
    ' "$SITES"/*.conf 2>/dev/null | sort -u)
    if [ -z "$found" ]; then
        echo "  [WARN] No vhost found for parent '$parent' — if it exists under a"
        echo "         different server_name, add access_log off manually there."
    fi
done

# Dedup files (same file matched via multiple tokens) while keeping parallel arrays
declare -a FILES=()
declare -a FILE_PARENTS=()
declare -A SEEN_FILE=()
for i in "${!PARENT_FILES[@]}"; do
    f="${PARENT_FILES[$i]}"
    [ -n "${SEEN_FILE[$f]:-}" ] && continue
    SEEN_FILE[$f]=1
    FILES+=("$f")
    FILE_PARENTS+=("${PARENT_OF_FILE[$i]}")
done

if [ ${#FILES[@]} -eq 0 ]; then
    echo "Error: no parent vhost files found in $SITES."
    exit 1
fi
echo "Parent vhost file(s):"
for i in "${!FILES[@]}"; do echo "  ${FILES[$i]}  (parent: ${FILE_PARENTS[$i]})"; done
echo ""

# --- 3. Insert access_log off into /dist/ location blocks ---
insert_access_log_off() {
    awk '
        function indent_of(s) { match(s, /^[ \t]*/); return substr(s, 1, RLENGTH) }
        function flush_block(   i, has, ind) {
            has = 0
            for (i = 1; i <= n; i++)
                if (buf[i] ~ /access_log[ \t]+off[ \t]*;/) has = 1
            if (single_line) {
                if (!has)
                    print "  AWKWARN single-line dist location at line " blockline " — edit manually" > "/dev/stderr"
                for (i = 1; i <= n; i++) print buf[i]
            } else if (has) {
                for (i = 1; i <= n; i++) print buf[i]
            } else {
                ind = indent
                for (i = 1; i <= n; i++) {
                    print buf[i]
                    if (i == openline)
                        print ind "    access_log off;  # keep ?key= config URLs out of access.log (fix-dist-nolog.sh)"
                }
                changed = 1
            }
            inblk = 0; n = 0
        }
        BEGIN { inblk = 0; changed = 0; err = 0 }
        {
            if (!inblk) {
                if ($0 ~ /[Ll]ocation/ && $0 ~ /dist/) {
                    inblk = 1; n = 1; buf[1] = $0
                    blockline = NR
                    indent = indent_of($0)
                    depth = 0
                    s = $0; gsub(/[^{]/, "", s); depth += length(s)
                    s = $0; gsub(/[^}]/, "", s); depth -= length(s)
                    opened = (index($0, "{") > 0)
                    openline = 1
                    single_line = (opened && depth <= 0)
                    if (single_line) flush_block()
                    next
                }
                print
            } else {
                s = $0; gsub(/[^{]/, "", s); oc = length(s)
                s = $0; gsub(/[^}]/, "", s); cc = length(s)
                if (!opened && oc > 0) { openline = n + 1; opened = 1 }
                n++; buf[n] = $0
                depth += oc - cc
                if (opened && depth <= 0) flush_block()
            }
        }
        END {
            if (inblk) {
                print "  AWKWARN unterminated location block at line " blockline " — leaving file unchanged" > "/dev/stderr"
                err = 1
                for (i = 1; i <= n; i++) print buf[i]
            }
            if (!err) print (changed ? "CHANGED" : "UNCHANGED") > "/dev/stderr"
        }
    '
}

any_change=0
manual_needed=0
declare -a BACKUPS=()
declare -a FIXED=()

for i in "${!FILES[@]}"; do
    f="${FILES[$i]}"
    if ! grep -qE '[Ll]ocation[^{]*dist' "$f" 2>/dev/null; then
        echo "  [WARN] $f has no /dist/ location block."
        echo "         App files may be served by a generic location — access_log off"
        echo "         must be added manually (see deploy/nginx/dist-nolog.conf)."
        manual_needed=1
        continue
    fi

    tmp=$(mktemp)
    msgfile=$(mktemp)
    insert_access_log_off < "$f" > "$tmp" 2>"$msgfile"

    if grep -q "AWKWARN" "$msgfile"; then
        echo "  [WARN] $f:"
        grep "AWKWARN" "$msgfile"
        manual_needed=1
    fi

    if grep -q "^CHANGED$" "$msgfile"; then
        if [ $DRY_RUN -eq 1 ]; then
            echo "  [DRY-RUN] would modify $f:"
            diff -u "$f" "$tmp" | sed 's/^/      /'
            any_change=1
        else
            bak="$f.pre-nolog-$STAMP"
            $SUDO cp -a "$f" "$bak"
            BACKUPS+=("$bak")
            $SUDO cp "$tmp" "$f"
            FIXED+=("$f")
            any_change=1
            echo "  [FIXED] $f  (backup: $bak)"
        fi
    else
        echo "  [OK]   $f — dist locations already have access_log off"
    fi
    rm -f "$tmp" "$msgfile"
done
echo ""

if [ $DRY_RUN -eq 1 ]; then
    if [ $any_change -eq 0 ]; then
        echo "--dry-run: nothing to change."
    else
        echo "--dry-run: no files were changed and nothing was reloaded."
        echo "Re-run without --dry-run to apply the diff above."
    fi
    if [ $manual_needed -eq 1 ]; then
        echo "Some vhosts need MANUAL additions regardless (see [WARN] lines + deploy/nginx/dist-nolog.conf)."
    fi
    exit 0
fi

# --- 4. Validate + reload ---
if [ $any_change -eq 1 ]; then
    echo "Validating nginx config..."
    if ! $SUDO nginx -t; then
        echo ""
        echo "nginx -t FAILED — restoring backups:"
        j=0
        for f in "${FIXED[@]}"; do
            $SUDO cp -a "${BACKUPS[$j]}" "$f"
            echo "  restored $f"
            j=$((j + 1))
        done
        echo "Nothing reloaded. Inspect the WARN lines above and edit manually."
        exit 1
    fi
    if $SUDO systemctl reload nginx; then
        echo "  nginx reloaded."
    else
        echo "  WARNING: nginx -t passed but reload failed — run: sudo systemctl reload nginx"
    fi
    echo ""
else
    echo "No config changes needed."
    echo ""
fi

# --- 5. Proof test (one marker per parent that has an instance) ---
if [ $RUN_TEST -eq 1 ]; then
    for parent in "${PARENTS[@]}"; do
        rep="${REP_OF[$parent]:-}"
        if [ -z "$rep" ]; then
            echo "--test: skipping $parent (no <app>.$parent subdomain vhost to test)"
            continue
        fi
        MARKER="nologtest$(openssl rand -hex 6 2>/dev/null || date +%s%N)"
        URL="https://${parent}/${rep}/dist/?key=${MARKER}"
        echo "--test: $URL"
        if command -v curl >/dev/null 2>&1; then
            curl -s -o /dev/null "$URL"
        else
            $SUDO wget -q -O /dev/null "$URL"
        fi
        sleep 1
        if $SUDO grep -q "$MARKER" /var/log/nginx/access.log 2>/dev/null; then
            echo "  [FAIL] marker IS in access.log — find the location serving /$rep/dist/"
            echo "         (nginx -T | grep -n -B5 dist) and add access_log off there."
        else
            echo "  [PASS] marker not logged."
        fi
    done
    echo ""
fi

# --- 6. Purge already-logged keys ---
if [ $PURGE_LOGS -eq 1 ]; then
    echo "--purge-logs:"
    cur_count=$($SUDO grep -c -E '[?&]key=[A-Za-z0-9_-]{8,}' /var/log/nginx/access.log 2>/dev/null || true)
    echo "  Current access.log: ${cur_count:-0} line(s) with ?key="
    rot=$($SUDO sh -c 'ls /var/log/nginx/access.log.[0-9]* /var/log/nginx/access.log.*.gz 2>/dev/null' | wc -l)
    echo "  Rotated log files:  $rot"
    $SUDO truncate -s 0 /var/log/nginx/access.log
    $SUDO sh -c 'rm -f /var/log/nginx/access.log.[0-9]* /var/log/nginx/access.log.*.gz' 2>/dev/null
    echo "  Truncated access.log, removed rotated logs."
    echo "  NOTE: logged keys were exposed until now — rotate them (key plan)."
    echo ""
fi

if [ $manual_needed -eq 1 ]; then
    echo "Some vhosts need MANUAL additions (see [WARN] lines + deploy/nginx/dist-nolog.conf)."
fi
echo "Done. Re-run deploy/verify.sh section 19 to confirm."
