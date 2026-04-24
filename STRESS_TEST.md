# Rating Stress Test — Tournament Simulation

## Overview

Simulates single-day tournaments with Elo-weighted match outcomes, processing games in batches with mid-tournament recalculations. Measures rating convergence via RSS (root-mean-square deviation) and stress-tests the recalculation engine under varying player counts and game types.

## How It Works

1. **Player Setup**: Generates players with ratings 100–1800, `num_games=20` (experienced), ~15% random ineligible. Seeded PRNG (Mulberry32) ensures reproducibility.
2. **Round-Robin Pairing**: Fisher-Yates shuffle each round, consecutive pairing. 2p = 1v1, 4p = 2v2 sides.
3. **Elo-Weighted Results**: Expected win probability from rating difference (clamped to ±400), with 5% draw rate per side.
4. **Batch Processing**: After each round, recalculates ratings from scratch using ALL matches so far (simulating mid-tournament recalc).
5. **RSS Tracking**: Measures deviation of `nRating` from start ratings after each batch.
6. **Result Validation**: Iterative cleaning removes invalid/conflicting game result entries until `processGameResults` reports zero errors.

## Test Matrix

6 configurations × 2 modes = **12 tests**:

| # | Test Name | Players | Game Type | Rounds | Games/Player | Seed |
|---|-----------|---------|-----------|--------|--------------|------|
| 1 | Single-pass: 20p_2p | 20 | 1v1 | 20 | 20 | 42 |
| 2 | Double-pass: 20p_2p | 20 | 1v1 | 20 | 20 | 42 |
| 3 | Single-pass: 20p_4p | 20 | 2v2 | 20 | 20 | 43 |
| 4 | Double-pass: 20p_4p | 20 | 2v2 | 20 | 20 | 43 |
| 5 | Single-pass: 50p_2p | 50 | 1v1 | 31 | 31 | 44 |
| 6 | Double-pass: 50p_2p | 50 | 1v1 | 31 | 31 | 44 |
| 7 | Single-pass: 50p_4p | 52 | 2v2 | 31 | 31 | 45 |
| 8 | Double-pass: 50p_4p | 52 | 2v2 | 31 | 31 | 45 |
| 9 | Single-pass: 100p_2p | 100 | 1v1 | 31 | 31 | 46 |
| 10 | Double-pass: 100p_2p | 100 | 1v1 | 31 | 31 | 46 |
| 11 | Single-pass: 100p_4p | 100 | 2v2 | 31 | 31 | 47 |
| 12 | Double-pass: 100p_4p | 100 | 2v2 | 31 | 31 | 47 |

**Notes**:
- 4p configs round up to multiple of 4 (50 → 52)
- Rounds = `min(31, max(20, floor(players/5) * 5))`
- All players have `num_games=20` (experienced), so Elo formula applies from game 1
- Single-pass and double-pass produce identical results for experienced players (double-pass only affects `num_games=0` blending)

## Outputs

### Console Output (per test)

```
[SP] 20p_2p: FinalRSS=117.13, F1=117.13, F2=117.13
[DP] 20p_2p: FinalRSS=117.13, F1=117.13, F2=117.13
```

- **FinalRSS**: RSS after last round — how far calculated ratings diverged from start ratings
- **F1/F2**: RSS from two consecutive recalcs on final state — measures rating stability

### Generated Files

All outputs in `src/test/unit/reports/`:

#### `summary.tsv`

Tab-separated summary of all 12 tests:
- **Config**: `Np_GG_mode` (e.g., `20p_2p_sp`)
- **Final1/Final2**: Drift RSS from consecutive recalcs
- **RSS_1..RSS_31**: RSS history after each round

Example:
```
Config	Final1	Final2	RSS_1	RSS_2	...	RSS_20
20p_2p_sp	117.13	117.13	11.55	23.90	...	117.13
20p_2p_dp	117.13	117.13	11.55	23.90	...	117.13
```

#### `20p_2p_sp.tab`, `20p_2p_dp.tab`, `20p_4p_sp.tab`, `20p_4p_dp.tab`

Valid ladder `.tab` files (20-player configs only) with:
- Static **Rating** column (start ratings, unchanged — single-day tournament)
- Dynamic **N Rate** column (calculated ratings from tournament results)
- **Gms** = games played this tournament day
- Columns 1–31: cleaned game result strings (e.g., `1W3_`, `2D5_`)
- `trophyEligible` encoded as sign prefix (`-` for ineligible)

## Metrics Explained

### RSS (Root-Mean-Square Deviation)

```
RSS = sqrt( Σ(nRating - startRating)² / N )
```

Tracks how far calculated ratings diverge from start ratings as more games are added. Higher RSS = more rating movement expected from the tournament data.

### Final1 vs Final2 (Stability)

Two consecutive recalcs on the final state:
- **F1 = F2**: Ratings are stable — recalculating doesn't change results
- **F1 ≠ F2**: Ratings have drift — recalculating produces different results

### RSS History

Shows convergence trajectory:
- **Monotonically increasing**: Expected — more games → more data → more deviation from start
- **Plateauing**: Ratings stabilizing as tournament progresses

## Running the Tests

```bash
npx vitest run ratingStressTest
```

Full suite:
```bash
npx vitest run
```

## Key Design Decisions

- **Single-day simulation**: No "New Day" between rounds — `Rating` stays static, `N Rate` captures all calculated values
- **Experienced players** (`num_games=20`): Uses Elo formula from game 1, avoiding 2p blending trap where `perfRating` clamps to 0
- **From-scratch recalc**: Each batch recalculates all matches, matching VB6 behavior where you recalc with all entered results
- **Result cleaning**: `cleanInvalidResults` iteratively removes conflicting entries until validation passes

## Session Design Rationale

### Why 5× More Games?

The original 4 rounds per config produced too few data points for meaningful convergence analysis. With 20–31 rounds (20–31 games/player), the RSS trajectory has enough resolution to show whether ratings are converging, diverging, or oscillating. Statistical significance requires sufficient sample size — 20 games/player is the practical minimum for Elo systems.

### Why Single-Day (No New Day)?

A real tournament enters results in batches (~5 at a time), recalculates after each batch to see mid-tournament standings, then enters the next batch. The stress test models this exactly:

```
Batch 1 (5 games) → Recalc → RSS_1
Batch 2 (5 games) → Recalc → RSS_2  (recalcs ALL 10 games from scratch)
Batch 3 (5 games) → Recalc → RSS_3  (recalcs ALL 15 games from scratch)
...
```

This is critical because:
- **VB6 behavior**: Each recalc reads from the `Rating` column (static during the day), processes all entered matches, writes to `nRating`
- **No New Day**: `Rating` never changes — it's the start-of-day value. `nRating` is the live calculated value
- **Mid-tournament visibility**: Players see their current performance rating without committing it to the permanent `Rating` column

### Why From-Scratch Recalc Each Round?

The simulation accumulates ALL matches and recalculates from scratch after each batch, matching how the VB6 application works: you don't incrementally update ratings — you press "Recalculate" and it processes every entered result from the current `Rating` column. This means:

- `num_games` stays at 0 during the tournament (no New Day to increment it)
- Init rating logic applies: players with `num_games=0` use `nRating/rating` as starting point
- Each recalc is independent — no state carried between recalcs except the static `Rating` column

### Why Experienced Players (`num_games=20`)?

With `num_games=0`, 2-player blending uses `perfRating = side ∓ 800*wldPerfs`, which can go negative and clamp to 0 via `Math.max(0, perfRating)`. This traps low-rated players at `nRating=0` for the first 10 games. Setting `num_games=20` forces Elo from game 1, which is realistic — tournament participants are experienced players, not new to the ladder.

### Why Validate Output Files?

The `.tab` files aren't just test artifacts — they're valid ladder files that can be imported back into the application. This creates a round-trip test:

```
Generate tournament → Calculate ratings → Write .tab → Import .tab → Validate results
```

If the output files are invalid, the application would reject them. The `cleanInvalidResults` function ensures the output passes `processGameResults` validation, catching bugs like:
- Conflicting results (player 1 says `1W3`, player 3 says `1L3`)
- Duplicate players in a match
- Invalid result format

### Why No New Day Between Rounds?

A real tournament enters results in batches, recalculates after each batch to see mid-tournament standings, then enters the next batch. The stress test models this exactly — no New Day means `Rating` stays static (start-of-day value) while `nRating` reflects live calculated ratings. This matches how the VB6 application works during a single day of tournament operation.

### Why Full Test Suite After Changes?

Every code change — whether in the algorithm, the test itself, or refactoring — requires running the full suite because:
- Isolated tests pass but integration breaks (e.g., unified `generateBatchGames` put 2p opponents in `player3` instead of `player2`)
- Refactoring can silently change behavior (code duplication removal is where the 2p bug was introduced)
- Regression detection: 217 tests across 13 files catch unintended side effects

### Why Code Duplication Matters in Tests

Test code is production code that runs every commit. Duplication in tests:
- Hides bugs (the 2p/4p duplication hid the match format bug for 2p)
- Makes maintenance harder (fixing 2p doesn't fix 4p)
- Increases false positive risk (duplicate logic can diverge over time)

### Why Drift Measurement (F1/F2)?

Two consecutive recalcs on the final state measure whether ratings have converged:
- **F1 = F2**: Stable — ratings don't change between recalcs
- **F1 ≠ F2**: Unstable — recalculating produces different results

This validates that the recalculation engine produces consistent results under stress.

### Why Same Seed Per Config?

Each config uses the same seed for both SP and DP runs, ensuring the match outcomes are identical. This provides a control — any difference in results can only come from the pass mode, not from different match data.

### Why Iterative Result Cleaning?

The `cleanInvalidResults` function loops up to 10 times, removing invalid entries and re-validating. This is necessary because:
- Removing one invalid entry can expose another (conflicting pairs)
- The validation itself may produce new errors when entries shift
- Real-world data has cascading conflicts that require multiple passes to resolve

This tests the robustness of the validation system under stress conditions.
