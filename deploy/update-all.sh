#!/bin/bash
# Update all ladder instances on the server
# Run from: /var/www/html/
# Usage: ./deploy/update-all.sh [--force|--force-critical]
#
# Flags are passed through to each instance's update.sh

BASE="/var/www/html"
FLAGS="$@"
OK=0
FAIL=0

echo "========================================"
echo "  Update ALL Ladder Instances"
echo "  Base: $BASE"
echo "  Flags: ${FLAGS:-none}"
echo "========================================"
echo ""

for dir in "$BASE"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")

    # Skip non-ladder directories (ladders always have "ladder" in name)
    echo "$name" | grep -qi "ladder" || continue

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

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
