# Rating Stress Test — Tournament Simulation

> Simulates pseudo-random tournaments with Elo-weighted results, processes games in batches with recalc after each batch, and measures rating convergence via RSS (root-mean-square deviation).

## What It Does

Each test:
1. Creates N players with ratings spread from 100 to 1800
2. Runs tournament rounds — each round generates matches with outcomes weighted by Elo probability
3. After each round, recalculates ratings using `calculateRatings()` (double-pass averaging)
4. Tracks RSS (deviation from starting ratings) after each round
5. Outputs `.tab` files for 20-player configs and a summary TSV

### Pairing Strategy

- **2p**: Fisher-Yates shuffle each round, consecutive pairing. Matches with >600-point rating gap are skipped.
- **4p**: Round-robin ends-inward pairs, merged with shifting offset each round. Same 600-point cap.
- **Rounds**: Default 20, capped at `players - 1` to avoid duplicate matchups
- **Dedup**: Tracks opposing pairs per player — same pair can't face each other twice

### numGames Modes

| Mode | `num_games` | Blending |
|---|---|---|
| `new` (ng0) | 0 | Full blending with initial rating cap (1800) |
| `mixed` (ng0-10) | 0 or 20 (50/50) | Mixed blending behavior |
| `experienced` (ng20) | 20 | Incremental Elo accumulation (no blending) |

## Running Tests

### Quick 1-Round Tests (instant, development cycle)

```bash
npx vitest run -t "Quick 1 Round"
```

Runs 4 quick tests (20p, 1 round each). Useful for fast iteration.

### Full Stress Test Suite

```bash
npx vitest run ratingStressTest
```

Runs all 22 tests across 3 player counts (20, 50, 100), 2 game types (2p, 4p), and 3 experience modes (ng0, ng0-10, ng20).

### With Verbose Output

```bash
npx vitest run ratingStressTest --reporter=verbose
```

Shows FinalRSS, F1, F2 for each test.

### Run a Single Config

```bash
npx vitest run -t "20p_2p_ng0 "
```

(Trailing space avoids matching `20p_2p_ng0-10`.)

## Output

Reports are written to `src/test/unit/reports/`:

| File | Description |
|---|---|
| `summary.tsv` | All test results — RSS per round, F1, F2 |
| `20p_2p_ng0.tab` | Final ladder state for 20-player 2p new players (full suite) |
| `20p_4p_ng0.tab` | Final ladder state for 20-player 4p new players (full suite) |
| `20p_2p_ng0-10.tab` | Mixed experience 2p |
| `20p_2p_ng20.tab` | Experienced players 2p |
| (same pattern for 4p) | ... |
| `1r_20p_2p_ng0.tab` | Quick 1-round 2p new players |
| `1r_20p_2p_ng20.tab` | Quick 1-round 2p experienced |
| `1r_20p_4p_ng0.tab` | Quick 1-round 4p new players |
| `1r_20p_4p_ng20.tab` | Quick 1-round 4p experienced |

## Understanding Results

### RSS (Root-Mean-Square Deviation)

Measures how far final ratings are from starting ratings. Lower = better convergence.

- **ng0 (new players)**: Higher RSS due to blending pulling toward initial ratings
- **ng20 (experienced)**: Low RSS — ratings converge toward true skill
- **F1/F2**: Two final recalcs on all matches. F1≈F2 means the system has converged.

### Expected Behavior

- 2p produces more results per player than 4p (2 opponents per match vs 4)
- Players at rating extremes have fewer games (600-point cap filters matchups)
- ng0 tests show higher RSS due to blending with initial ratings
- ng20 tests show RSS near 0 — experienced players converge to true skill

## Test Configurations

| Players | Game Type | numGames | Rounds | Label |
|---|---|---|---|---|
| 20, 50, 100 | 2p, 4p | new, mixed, experienced | 20 (cap: N-1) | `{N}p_{2p|4p}_{ng0|ng0-10|ng20}` |

## Key Files

- `src/test/unit/ratingStressTest.test.ts` — Test implementation, configs, pairing logic
- `shared/utils/hashUtils.ts` — `calculateRatings()`, `repopulateGameResults()`
- `src/test/unit/reports/` — Generated output
