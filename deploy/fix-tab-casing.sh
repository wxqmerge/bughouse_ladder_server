#!/bin/bash
# fix-tab-casing.sh — rename mini-game .tab files to lowercase, delete uppercase duplicates
# Usage: ./fix-tab-casing.sh [data_directory]
# Default data directory: /var/www/html/dev-ladder/server/data

set -euo pipefail

DATA_DIR="${1:-/var/www/html/dev-ladder/server/data}"

if [ ! -d "$DATA_DIR" ]; then
  echo "ERROR: Data directory not found: $DATA_DIR"
  exit 1
fi

echo "=== Fixing .tab file casing in: $DATA_DIR ==="
echo ""

# Step 1: Rename uppercase files to lowercase (if lowercase doesn't exist yet)
echo "--- Step 1: Renaming uppercase files to lowercase ---"
for f in "$DATA_DIR"/*.tab; do
  [ -f "$f" ] || continue
  basename=$(basename "$f")
  lowercase=$(echo "$basename" | tr '[:upper:]' '[:lower:]')

  # Skip if already lowercase
  if [ "$basename" = "$lowercase" ]; then
    continue
  fi

  target="$DATA_DIR/$lowercase"
  if [ -f "$target" ]; then
    echo "  SKIP: $basename (lowercase $lowercase already exists)"
  else
    mv "$f" "$target"
    echo "  RENAMED: $basename -> $lowercase"
  fi
done

echo ""

# Step 2: Delete any remaining uppercase files (shouldn't be any, but just in case)
echo "--- Step 2: Removing remaining uppercase files ---"
for f in "$DATA_DIR"/*.tab; do
  [ -f "$f" ] || continue
  basename=$(basename "$f")
  lowercase=$(echo "$basename" | tr '[:upper:]' '[:lower:]')

  if [ "$basename" != "$lowercase" ]; then
    echo "  DELETED: $basename"
    rm "$f"
  fi
done

echo ""
echo "=== Done. Current .tab files: ==="
ls -1 "$DATA_DIR"/*.tab 2>/dev/null || echo "  (none)"
