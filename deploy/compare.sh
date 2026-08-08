#!/bin/bash
# Compare all ladder instances — player counts and mini-game results
# Run from: /var/www/html/
# Usage: ./deploy/compare.sh

BASE="/var/www/html"
MINI_GAMES="bg_game.tab bishop_game.tab pillar_game.tab kings_cross.tab pawn_game.tab queen_game.tab bughouse.tab"

TOTAL_INSTANCES=0
TOTAL_PLAYERS=0
TOTAL_RESULTS=0

declare -A INSTANCE_CLUB_PLAYERS
declare -A INSTANCE_RESULTS

echo "========================================"
echo "  Ladder Instances Comparison"
echo "  Base: $BASE"
echo "========================================"
echo ""

for dir in "$BASE"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")

    # Skip non-ladder directories
    echo "$name" | grep -qi "ladder" || continue

    TOTAL_INSTANCES=$((TOTAL_INSTANCES + 1))
    data_dir="$dir/server/data"

    echo "========================================"
    echo "  $name"
    echo "========================================"

    if [ ! -d "$data_dir" ]; then
        echo "  [SKIP] No data directory: server/data/"
        echo ""
        continue
    fi

    club_players=0
    instance_results=0

    # Club ladder (source of truth for player count)
    if [ -f "$data_dir/ladder.tab" ]; then
        # Count players: data rows with a Last Name (field 2) that is non-empty
        club_players=$(awk -F'\t' 'NR>1 && $2!="" {count++} END {print count+0}' "$data_dir/ladder.tab")
        # Count results: non-empty cells in columns 13-43 (rounds 1-31)
        results=$(awk -F'\t' 'NR>1 && $2!="" {
            for (i=13; i<=43; i++) {
                gsub(/^[[:space:]]+|[[:space:]]+$/, "", $i)
                if ($i != "") count++
            }
        } END {print count+0}' "$data_dir/ladder.tab")
        echo "  ladder.tab: $club_players players, $results results"
        instance_results=$((instance_results + results))
    fi

    # Mini-games (same players, only count results)
    for mg in $MINI_GAMES; do
        if [ -f "$data_dir/$mg" ]; then
            results=$(awk -F'\t' 'NR>1 && $2!="" {
                for (i=13; i<=43; i++) {
                    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $i)
                    if ($i != "") count++
                }
            } END {print count+0}' "$data_dir/$mg")
            echo "  $mg: $results results"
            instance_results=$((instance_results + results))
        fi
    done

    INSTANCE_CLUB_PLAYERS[$name]=$club_players
    INSTANCE_RESULTS[$name]=$instance_results

    echo ""
    TOTAL_PLAYERS=$((TOTAL_PLAYERS + club_players))
    TOTAL_RESULTS=$((TOTAL_RESULTS + instance_results))
done

echo "========================================"
echo "  SUMMARY"
echo "========================================"
echo ""
printf "  %-30s %8s %10s\n" "Instance" "Players" "Results"
printf "  %-30s %8s %10s\n" "------------------------------" "--------" "----------"
for name in $(echo "${!INSTANCE_CLUB_PLAYERS[@]}" | tr ' ' '\n' | sort); do
    printf "  %-30s %8d %10d\n" "$name" "${INSTANCE_CLUB_PLAYERS[$name]}" "${INSTANCE_RESULTS[$name]}"
done
printf "  %-30s %8s %10s\n" "------------------------------" "--------" "----------"
printf "  %-30s %8d %10d\n" "TOTAL ($TOTAL_INSTANCES instances)" "$TOTAL_PLAYERS" "$TOTAL_RESULTS"
echo ""
