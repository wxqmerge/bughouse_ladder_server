#!/bin/bash
# Update all hiking app instances on the server
# Hiking apps always have "sothh" in the directory name
# Run from: /var/www/html/
# Usage: ./deploy/update-sothh.sh [--force|--force-critical]

BASE="/var/www/html"
FLAGS="$@"
OK=0
FAIL=0

echo "========================================"
echo "  Update ALL Hiking App Instances"
echo "  Base: $BASE"
echo "  Flags: ${FLAGS:-none}"
echo "========================================"
echo ""

for dir in "$BASE"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")

    # Hiking apps have "sothh" in name
    echo "$name" | grep -qi "sothh" || continue

    echo "========================================"
    echo "  Updating: $name"
    echo "========================================"

    cd "$dir" 2>/dev/null || continue
    if bash deploy/update.sh $FLAGS; then
        echo ""
        echo "  ✓ $name updated successfully"
        OK=$((OK + 1))
    else
        echo ""
        echo "  ✗ $name FAILED"
        FAIL=$((FAIL + 1))
    fi
    echo ""
done

echo "========================================"
echo "  Done: $OK OK, $FAIL failed"
echo "========================================"

[ "$FAIL" -gt 0 ] && exit 1
