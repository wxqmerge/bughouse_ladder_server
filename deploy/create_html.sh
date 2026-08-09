#!/bin/bash
# Generate bookmarks HTML for all ladder instances
# Run from: /var/www/html/
# Usage: ./deploy/create_html.sh
#
# Reads API keys from each matching instance's server/.env and
# generates a Netscape bookmarks HTML file in $HOME/
# Structure: app-name/
#             Admin/
#               - Admin (instance1)
#               - Admin (instance2)
#             User/
#               - User (instance1)
#               - User (instance2)
#             View/
#               - View (instance1)
#               - View (instance2)

BASE="/var/www/html"
DOMAIN="chess4.us"
DATE=$(date '+%Y-%m-%d')
OUTPUT="$HOME/ladder-bookmarks-${DATE}.html"
TS=$(date +%s)

# Detect the project repo from the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CALLER_REMOTE=$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null)
CALLER_REPO=$(basename "$CALLER_REMOTE" .git)

if [ -z "$CALLER_REPO" ]; then
    echo "Error: could not detect git repo from $SCRIPT_DIR"
    echo "This script must be run from within a project directory."
    exit 1
fi

echo "========================================"
echo "  Create Bookmarks HTML"
echo "  Repo: $CALLER_REPO"
echo "  Output: $OUTPUT"
echo "========================================"
echo ""

# Temp files for collecting bookmarks by type
ADMIN_TMP=$(mktemp)
USER_TMP=$(mktemp)
VIEW_TMP=$(mktemp)

COUNT=0
SKIP=0

for dir in "$BASE"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")

    # Must be a git repository
    if ! git -C "$dir" remote -v &>/dev/null; then
        SKIP=$((SKIP + 1))
        continue
    fi

    # Detect repo from remote origin — must match calling project
    remote=$(git -C "$dir" remote get-url origin 2>/dev/null)
    repo=$(basename "$remote" .git)

    if [ "$repo" != "$CALLER_REPO" ]; then
        SKIP=$((SKIP + 1))
        continue
    fi

    ENV_FILE="$dir/server/.env"
    if [ ! -f "$ENV_FILE" ]; then
        echo "  ✗ $name — $ENV_FILE not found, skipping"
        SKIP=$((SKIP + 1))
        continue
    fi

    # Read keys
    ADMIN_KEY=$(grep '^ADMIN_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')
    USER_KEY=$(grep '^USER_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')

    # Find domain from nginx config
    proj_domain="$name.$DOMAIN"
    parent_domain="$DOMAIN"
    for conf in /etc/nginx/sites-available/${name}.*.conf; do
        if [ -f "$conf" ]; then
            proj_domain=$(grep 'server_name' "$conf" 2>/dev/null | tr -d '\r' | sed 's/server_name//;s/;//' | tr -s ' ' | awk '{print $1}')
            parent_domain=$(echo "$proj_domain" | sed 's/^[^.]*\.//')
            break
        fi
    done

    # Build URLs (server auto-detected from window.location.origin)
    ADMIN_URL="https://${parent_domain}/${name}/dist/?key=${ADMIN_KEY}"
    USER_URL="https://${parent_domain}/${name}/dist/?key=${USER_KEY}"
    VIEW_URL="https://${parent_domain}/${name}/dist/"

    # Collect bookmarks by type
    echo "        <DT><A HREF=\"$ADMIN_URL\" ADD_DATE=\"$TS\">Admin ($name)</A>" >> "$ADMIN_TMP"
    echo "        <DT><A HREF=\"$USER_URL\" ADD_DATE=\"$TS\">User ($name)</A>" >> "$USER_TMP"
    echo "        <DT><A HREF=\"$VIEW_URL\" ADD_DATE=\"$TS\">View ($name)</A>" >> "$VIEW_TMP"

    echo "  ✓ $name — 3 bookmarks added"
    COUNT=$((COUNT + 1))
done

# Write final HTML
cat > "$OUTPUT" << HEADER
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<meta HTTP-EQUIV="Content-Type" content="text/html; charset=UTF-8">
<title>Bookmarks</title>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="$TS">$CALLER_REPO</H3>
    <DL><p>
        <DT><H3 ADD_DATE="$TS">Admin</H3>
        <DL><p>
HEADER

cat "$ADMIN_TMP" >> "$OUTPUT"
cat >> "$OUTPUT" << 'MID'
        </DL><p>
        <DT><H3 ADD_DATE="0">User</H3>
        <DL><p>
MID

cat "$USER_TMP" >> "$OUTPUT"
cat >> "$OUTPUT" << 'MID2'
        </DL><p>
        <DT><H3 ADD_DATE="0">View</H3>
        <DL><p>
MID2

cat "$VIEW_TMP" >> "$OUTPUT"
cat >> "$OUTPUT" << 'FOOTER'
        </DL><p>
    </DL><p>
</DL><p>
FOOTER

# Cleanup temp files
rm -f "$ADMIN_TMP" "$USER_TMP" "$VIEW_TMP"

echo ""
echo "========================================"
echo "  Done: $COUNT instances, $SKIP skipped"
echo "  Output: $OUTPUT"
echo "========================================"
echo ""
echo "Import into browser:"
echo "  1. Download: scp user@server:$OUTPUT ~/Downloads/"
echo "  2. Browser → Bookmarks Manager → Import → $OUTPUT"
echo "  3. Delete from server: rm $OUTPUT"
