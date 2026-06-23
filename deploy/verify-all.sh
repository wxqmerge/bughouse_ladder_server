#!/bin/bash
# Verify all ladder instances on the server
# Run from: /var/www/html/
# Usage: ./deploy/verify-all.sh

if [ "$(whoami)" != "root" ] && ! sudo -n true 2>/dev/null; then
    echo "WARNING: This script works best with passwordless sudo."
fi

BASE="/var/www/html"
DOMAIN="chess4.us"
PASS_TOTAL=0
FAIL_TOTAL=0
WARN_TOTAL=0

echo "========================================"
echo "  Verify ALL Ladder Instances"
echo "  Base: $BASE"
echo "========================================"
echo ""

for dir in "$BASE"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")

    # Skip non-ladder directories (ladders always have "ladder" in name)
    echo "$name" | grep -qi "ladder" || continue

    echo "========================================"
    echo "  Verifying: $name"
    echo "========================================"

    cd "$dir" 2>/dev/null || continue

    # Run verify.sh and capture output
    output=$(bash deploy/verify.sh 2>&1)
    echo "$output"

    # Extract counts from summary line
    pass=$(echo "$output" | grep -oP '^\s+\K\d+(?= passed)' | tail -1)
    fail=$(echo "$output" | grep -oP '^\s+\K\d+(?= failed)' | tail -1)
    warn=$(echo "$output" | grep -oP '^\s+\K\d+(?= warnings)' | tail -1)

    PASS_TOTAL=$((PASS_TOTAL + ${pass:-0}))
    FAIL_TOTAL=$((FAIL_TOTAL + ${fail:-0}))
    WARN_TOTAL=$((WARN_TOTAL + ${warn:-0}))

    echo ""
done

echo "========================================"
echo "  GRAND TOTAL: $PASS_TOTAL passed, $FAIL_TOTAL failed, $WARN_TOTAL warnings"
echo "========================================"

if [ "$FAIL_TOTAL" -gt 0 ]; then
    exit 1
fi
