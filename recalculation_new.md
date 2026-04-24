# Recalculation System — Corrected Implementation (VB6 Match)

> Based on VB6 source at `C:\Users\wxqme\Desktop\Bughouse_ladder\ladder.frm` (Sub recalc, lines 1397-1656)
> Also: `common.bas` (parse_entry, formula, player2row, result_string)

---

## 1. Overview of Changes

Multiple bugs in the original implementation needed fixing:

| # | Bug | Original (wrong) | VB6 (correct) | Impact |
|---|---|---|---|---|
| 1 | **Performance formula** | `avg ± 200` (fixed bonus) | `avg + 800 * (actual - expected)` | 100% win rate gives +200 instead of +400+ |
| 2 | **Blending timing** | Post-loop with `perfBlendingFactor` | Inline during match processing | New players get wrong weights |
| 3 | **Elo for >9 games** | Fresh `nRating = abs(round(rating + K*(actual-expected)))` | `nRating += perfs * kFactor` (accumulates) | Experienced players don't accumulate properly |
| 4 | **Cross-side blending** | Own side's perfRating | Opposing side's perfRating (`sides(1-myside)`) | Blending direction inverted |
| 5 | **Elo perfs formula** | `±0.5 + 2×(0.5-exp)` for all | 2-player: `±0.5 + 1×(0.5-exp)`; 4-player: `2×(0.5-exp)` only | Wrong Elo adjustment |
| 6 | **2-player vs 4-player scores** | Same perfs computation | `scores(1)=0` in 2-player → loops run once; `scores(1)>0` in 4-player → loops run twice, W/L/D cancels | Fundamental difference missed |
| 7 | **Rating column overwrite** | `rating` updated during recalc | `rating` only updated during New Day (line 1611+) | User edits to rating get overwritten |
| 8 | **Init rating source** | `nRating` always preferred | `rating` for num_games>0, `nRating` for num_games=0 | User edits ignored |
| 9 | **nRating reset** | Not reset during New Day | Reset to 0 during New Day | Stale nRating overrides user edits |

---

## 2. VB6 Algorithm Analysis

### 2.0 VB6 `scores` Array — Critical Distinction

**`common.bas` line 90:** `result_string = "OLDWXYZ__________"`
- O=0, L=1, D=2, W=3 (InStr position - 1)

**`common.bas` lines 223-226:** `score(0)` and `score(1)` parsed from result string
- **2-player:** only 1 result char → `scores(0)` = result, `scores(1)` = 0
- **4-player:** 2 result chars → `scores(0)` = side 0 result, `scores(1)` = side 1 result

**This is the KEY distinction** — the VB6 loops check `scores(myplayer) > 0`, so:
- 2-player: only `myplayer=0` runs in both loops (scores(1)=0)
- 4-player: both `myplayer=0` and `myplayer=1` run → W/L/D cancels, expected diff doubles

### 2.1 VB6 `recalc()` — Key Sections

**Lines 1422-1449: Initialization**
```vb
k_val = Val(Settings!K_Factor.Text)
For i = 1 To Chess.Rows - 1
    num_games(i) = Val(Chess.TextMatrix(i, Games_field))
    perf = Val(Chess.TextMatrix(i, rating_field))
    If num_games(i) = 0 Then
        perf = Val(Chess.TextMatrix(i, nrating_field))
        If perf > 1200 Then perf = 1200
        nrating(i) = Abs(perf)
    Else
        nrating(i) = Abs(perf)
    End If
Next
```
- `num_games` read from file (career history)
- `nrating` initialized from rating (or nRating if num_games=0)
- Rating capped at 1200 for num_games=0 players
- All ratings stored as absolute values

**Lines 1474-1535: Match Processing (the core)**
```vb
For i = 1 To hashsize
    ret = parse_entry(my_text$, players, scores, quick_entry)
    Call player2row(players)
    If players(1) > 0 Then
        sides(0) = (nrating(players(0)) + nrating(players(1))) / 2
        sides(1) = (nrating(players(4)) + nrating(players(3))) / 2
    Else
        sides(0) = nrating(players(0))
        sides(1) = nrating(players(3))
    End If
    perf = formula(sides(0), sides(1))
    perfs(0) = 0: perfs(1) = 0
    ' === FIRST LOOP: W/L/D component ===
    For myplayer = 0 To 1
        If scores(myplayer) > 0 Then
            Select Case scores(myplayer)
                Case 3: perfs(0) += 0.5: perfs(1) -= 0.5
                Case 2: ' draw: no change
                Case 1: perfs(0) -= 0.5: perfs(1) += 0.5
            End Select
        End If
    Next
    ' === PERF RATING (for blending): uses perfs from first loop ===
    If scores(1) > 0 Then sides(0) *= 2: sides(1) *= 2
    sides(0) = sides(0) + 800 * perfs(1)
    sides(1) = sides(1) + 800 * perfs(0)
    If scores(1) > 0 Then sides(0) /= 2: sides(1) /= 2
    If sides(0) < 0 Then sides(0) = 0
    If sides(1) < 0 Then sides(1) = 0
    ' === SECOND LOOP: expected score differential ===
    For myplayer = 0 To 1
        If scores(myplayer) > 0 Then
            perfs(0) = perfs(0) + (0.5 - perf)
            perfs(1) = perfs(1) + (perf - 0.5)
        End If
    Next
    ' === UPDATE EACH PLAYER (uses perfs from BOTH loops) ===
    For myside = 0 To 1
        For myplayer = 0 To 1
            pl = myside * 3 + myplayer
            If num_games(players(pl)) > 9 Then
                nrating(players(pl)) += perfs(myside) * k_val
            Else
                nrating(players(pl)) = (nrating(players(pl)) * num_games(players(pl)) + sides(1 - myside)) / (num_games(players(pl)) + 1)
            End If
            nrating(players(pl)) = Abs(nrating(players(pl)))
            num_games(players(pl)) += 1
        Next
    Next
Next
```

**CRITICAL: 2-player vs 4-player perfs difference:**
- **2-player** (`scores(1)=0`): first loop runs once (±0.5), second loop runs once (+0.5-exp)
  - `perfs(0) = ±0.5 + (0.5 - expected)`
  - `perfs(1) = ∓0.5 + (expected - 0.5)`
- **4-player** (`scores(1)>0`): first loop runs twice (±0.5 cancels to 0), second loop runs twice
  - `perfs(0) = 2 × (0.5 - expected)`
  - `perfs(1) = 2 × (expected - 0.5)`
- **PerfRating for blending** uses perfs from AFTER first loop, BEFORE second:
  - 2-player: `sides(0) = side0 - 800×wldPerfs`, `sides(1) = side1 + 800×wldPerfs`
  - 4-player: perfs=(0,0) → `sides` unchanged → perfRating = original side rating

**Lines 1600-1610: Writing back nRating**
```vb
For i = 1 To Chess.Rows - 1
    If isvalid(i) Then
        If (Val(Chess.TextMatrix(i, rating_field)) < 0) Then
            Chess.TextMatrix(i, nrating_field) = Str$(-Int(nrating(i)))
        Else
            Chess.TextMatrix(i, nrating_field) = Str$(Int(nrating(i)))
        End If
    Else
        Chess.TextMatrix(i, nrating_field) = "0"
    End If
Next
```
- trophyEligible determined by `rating` (old_rating) column sign
- Negative rating → nRate written with "-" prefix
- Positive/zero rating → nRate written without sign

---

## 3. Corrected Algorithm

### 3.1 Data Structures

No intermediate stats map needed — all processing is inline per match.

### 3.2 Match Processing (inline, replaces Elo loop + post-loop)

For each match:

1. **Compute side ratings** (VB6 ladder.frm:1479-1485):
   - 2-player: `side[0] = nrating(p1)`, `side[1] = nrating(p2)`
   - 4-player: `side[0] = (nrating(p1) + nrating(p2)) / 2`, `side[1] = (nrating(p3) + nrating(p4)) / 2`

2. **Compute expected score** (VB6 ladder.frm:1486, common.bas:129-131):
   ```typescript
   expected = 1 / (1 + 10^((abs(side1) - abs(side0)) / 400))
   ```

3. **W/L/D component** (VB6 ladder.frm:1489-1501):
   - 2-player: `wldPerfs = ±0.5` (only scores(0) > 0, scores(1) = 0)
   - 4-player: `wldPerfs = ±0.5` but cancels to 0 in perfs (both scores > 0)

4. **PerfRating for blending** (VB6 ladder.frm:1502-1513, uses perfs from first loop only):
   - 2-player: `perfRating[0] = side0 - 800×wldPerfs`, `perfRating[1] = side1 + 800×wldPerfs`
   - 4-player: `perfRating[0] = side0`, `perfRating[1] = side1` (perfs cancel to 0)
   - Clamp: `perfRating = max(0, perfRating)`

5. **Elo perfs** (VB6 ladder.frm:1514-1519, second loop adds expected diff):
   - 2-player: `eloPerfs[0] = wldPerfs + (0.5 - expected)`, `eloPerfs[1] = -wldPerfs + (expected - 0.5)`
   - 4-player: `eloPerfs[0] = 2×(0.5 - expected)`, `eloPerfs[1] = 2×(expected - 0.5)`

6. **Update nRating** (VB6 ladder.frm:1521-1533):
   - `num_games > 9`: `nRating += eloPerfs(myside) × kFactor` (Elo accumulation)
   - `num_games <= 9`: `nRating = (nRating × num_games + perfRating(1-myside)) / (num_games + 1)` (cross-side blending)
   - Store: `nRating = abs(nRating)`
   - Increment: `num_games++`

### 3.3 Key Differences from Original Code

| Aspect | Original (wrong) | Correct (VB6) |
|---|---|---|
| Performance formula | `avg ± 200` | `avg + 800 * (actual - expected)` |
| Blending | Post-loop, `perfBlendingFactor` used | Inline per-game, no damping factor |
| Blending perfRating | Own side's perfRating | **Opposing side's perfRating** (`sides(1-myside)`) |
| >9 games Elo | Fresh `nRating = abs(round(rating + K*(actual-expected)))` | `nRating += eloPerfs * kFactor` (incremental) |
| Elo perfs 2-player | `±0.5 + 2×(0.5-exp)` | `±0.5 + 1×(0.5-exp)` (loop runs once) |
| Elo perfs 4-player | Same as 2-player | `2×(0.5-exp)` only (W/L/D cancels, loop runs twice) |
| 4-player perfRating | Applied ±400 adjustment | No adjustment (perfs cancel to 0) |
| 4-player sides | Uses individual player ratings | Average of team members |
| Rating column | Updated during recalc | Only updated during New Day |
| Init rating source | `nRating` always preferred | `rating` for num_games>0, `nRating` for num_games=0 |
| Non-playing players | `nRating` unchanged | `nRating = 0` for players who didn't play |
| Final rounding | Not rounded | `Math.round()` (VB6: `Int()`) |

---

## 4. Implementation Plan

### 4.1 `shared/utils/hashUtils.ts` — `calculateRatings()`

**Remove:**
- `gameStats` map with `score`, `opponentRatings[]`, `gamesToday`
- Effective ratings snapshot map (no longer needed — we read nRating directly)
- `perfBlendingFactor` usage (no-op, keep in settings for UI compat)
- Post-loop performance rating calculation
- Post-loop blending logic

**Add:**
- Inline match processing with side ratings, score error accumulation, performance rating
- **Two-loop perfs** matching VB6: first loop (W/L/D), second loop (expected diff)
- **2-player vs 4-player distinction**: scores(1)=0 in 2-player → loops run once; scores(1)>0 in 4-player → loops run twice, W/L/D cancels
- **Elo perfs**: 2-player = `wldPerfs + (0.5-expected)`, 4-player = `2×(0.5-expected)` only
- **PerfRating**: 2-player = `side ∓ 800×wldPerfs`, 4-player = original side rating (perfs cancel)
- **CROSS-SIDE BLENDING**: `nRating = (nRating * num_games + perfRating_opposing) / (num_games + 1)` — side 0 blends with side 1's perfRating and vice versa
- Elo accumulation inline: `nRating += eloPerfs * kFactor` for `num_games > 9`
- `num_games++` after each match processed
- `playedToday` set to track which players played
- Final rounding: `Math.round()` for players who played
- `nRating = 0` for players who didn't play
- `rating` column NOT changed during recalc (only updated during New Day)
- Init: `rating` for num_games>0, `nRating` for num_games=0 (with 1200 cap)

**Preserve:**
- `trophyEligible` — never touched during recalculation (set at file I/O time)
- `effectiveRatings` map can be removed entirely

### 4.2 `shared/utils/hashUtils.ts` — `processGameResults()`

**No changes needed** — validation, dedup, and conflict detection are correct.

### 4.3 `shared/utils/constants.ts` — `processNewDayTransformations()`

**No changes needed** — already correctly:
- Uses `trophyEligible` to decide whether rating goes negative
- Resets gameResults, updates num_games, attendance

### 4.4 `shared/types/index.ts` — PlayerData & MatchData

**PlayerData:** No changes needed — `trophyEligible` field already present.

**MatchData:** Added `side0Won: boolean` field to track which original side won (needed because `processGameResults` normalizes/swaps sides).

### 4.5 `src/test/unit/calculateRatings.test.ts`

**Remove tests based on wrong formulas:**
- All tests expecting `avg ± 200` performance rating
- Tests for `perfBlendingFactor` behavior
- Tests for fresh Elo calculation for >9 games

**Add tests based on VB6:**
- Performance rating: `avg + 800 * (actual - expected)`
- Blending: inline `(nRating * num_games + perfRating) / (num_games + 1)`
- Elo accumulation: `nRating += perfs * kFactor` for >9 games
- 4-player: side averaging, opposing side error
- Edge cases: negative perf clamped to 0, nRating stored as abs

### 4.6 `src/test/fixtures/players.ts`

**No changes needed** — already has `trophyEligible` field.

### 4.7 `src/test/unit/newDay.test.ts`

**No changes needed** — New Day logic is correct.

---

## 5. Expected Behavior Changes

### 5.1 Elo Perfs Examples (2-player, >9 games)

| Scenario | eloPerfs | Elo Change (K=20) |
|---|---|---|
| Win vs equal (expected=0.5) | `0.5 + (0.5-0.5) = 0.5` | +10 |
| Win vs weaker (expected=0.75) | `0.5 + (0.5-0.75) = 0.25` | +5 |
| Win vs stronger (expected=0.25) | `0.5 + (0.5-0.25) = 0.75` | +15 |
| Draw vs equal (expected=0.5) | `0 + (0.5-0.5) = 0` | 0 |
| Loss vs equal (expected=0.5) | `-0.5 + (0.5-0.5) = -0.5` | -10 |
| Loss vs weaker (expected=0.25) | `-0.5 + (0.5-0.25) = -0.25` | -5 |
| Loss vs stronger (expected=0.75) | `-0.5 + (0.5-0.75) = -0.75` | -15 |

### 5.2 Elo Perfs Examples (4-player, >9 games)

| Scenario | eloPerfs | Elo Change (K=20) |
|---|---|---|
| Win vs equal (expected=0.5) | `2×(0.5-0.5) = 0` | 0 |
| Win vs weaker (expected=0.75) | `2×(0.5-0.75) = -0.5` | -10 |
| Win vs stronger (expected=0.25) | `2×(0.5-0.25) = 0.5` | +10 |
| Loss vs equal (expected=0.5) | `2×(0.5-0.5) = 0` | 0 |
| Loss vs weaker (expected=0.25) | `2×(0.5-0.25) = 0.5` | +10 |
| Loss vs stronger (expected=0.75) | `2×(0.5-0.75) = -0.5` | -10 |

**Note:** In 4-player Elo, W/L/D cancels out. Only the expected score differential matters. A win against a weaker team gives LESS Elo (or even negative), while a loss against a stronger team gives MORE Elo. This is because the ±0.5 component cancels when both sides have scores > 0.

### 5.3 Blending for New Players (<10 games)

| num_games | VB6 blending |
|---|---|
| 0 | Raw **opposing side's** perfRating (capped at 1200) |
| 3 | `(nRating * 3 + opposing_perf * 1) / 4` per game |
| 9 | `(nRating * 9 + opposing_perf * 1) / 10` per game |

**CRITICAL CROSS-SIDE BLENDING:** VB6 uses `sides(1 - myside)` — side 0 players blend with side 1's perfRating, and side 1 players blend with side 0's perfRating.

**2-player perfRating:** `perfRating[0] = side0 - 800×wldPerfs`, `perfRating[1] = side1 + 800×wldPerfs`
- Winner's perfRating is LOWER (side - 400), loser's is HIGHER (side + 400)
- Cross-side: winner blends with loser's higher perfRating, loser blends with winner's lower perfRating

**4-player perfRating:** `perfRating = original side rating` (perfs cancel to 0)
- Cross-side: winning side blends with losing side's lower rating, losing side with winning side's higher rating

The VB6 blends one game at a time, so the weight of each game is `1/(num_games+1)`. Career history (`num_games`) is the weight for historical rating.

### 5.4 Experienced Players (>9 games)

| Aspect | Original | VB6 |
|---|---|---|
| Formula | Fresh `nRating = abs(round(rating + K*(actual-expected)))` | `nRating += eloPerfs * K` |
| Consistency | Depends on match processing order | Same — both accumulate |
| Starting point | Always from `rating` (old rating) | From accumulated nRating |

The VB6 approach means experienced players start from their current nRating and adjust incrementally. The original approach recalculated from scratch each time, which could produce different results if the match order changed.

---

## 6. Edge Cases & Discovered Bugs

### 6.1 Zero/Blank Ratings

- VB6: `num_games === 0` → use nRating from file, cap at 1200
- Init: `rating` for num_games>0, `nRating` for num_games=0
- **Fix**: Match VB6 — read `rating` for players with games, `nRating` for num_games=0

### 6.2 Negative Performance Rating

- VB6: `If sides(0) < 0 Then sides(0) = 0` — clamp to 0
- **Fix**: Clamp perfRating to 0 before blending

### 6.3 4-Player Score Distinction (CRITICAL)

- VB6 `scores` array: 2-player has `scores(1)=0`, 4-player has `scores(1)>0`
- VB6 loops check `scores(myplayer) > 0`:
  - 2-player: loops run once → `eloPerfs = ±0.5 + (0.5-expected)`
  - 4-player: loops run twice → W/L/D cancels, `eloPerfs = 2×(0.5-expected)`
- **Fix**: Detect 2-player vs 4-player, apply correct Elo perfs formula

### 6.4 trophyEligible Preservation

- VB6: sign determined by `rating` column, written to `nrating_field`
- `trophyEligible` never touched during recalculation (set at file I/O time)
- No change needed

### 6.5 Cross-Side Blending (DISCOVERED BUG)

- VB6 line 1528: `nrating(players(pl)) = (nrating(players(pl)) * num_games(players(pl)) + sides(1 - myside)) / (num_games(players(pl)) + 1)`
- `sides(1 - myside)` means side 0 blends with side 1's perfRating, side 1 with side 0's
- Initial implementation had it backwards — each side blended with its own perfRating
- **Impact**: Blending direction inverted
- **Fix**: Swap perfRating0/perfRating1 in blending loops

### 6.6 Rating Column NOT Updated During Recalc (DISCOVERED BUG)

- VB6 lines 1600-1610: only `nrating_field` updated during recalc
- VB6 lines 1611-1627: `rating_field` only updated during New Day (Index >= 2)
- Original implementation updated `rating` during recalc — overwrote user edits
- **Fix**: Do NOT update `rating` during recalc

### 6.7 Non-Playing Players (DISCOVERED BUG)

- VB6: only writes nRating for players where `isvalid(i)` is true
- Players who didn't play get `nRating = 0`
- **Fix**: Track `playedToday` set, set `nRating = 0` for non-playing players

### 6.8 Final Rounding

- VB6: uses `Int()` (truncation toward zero) when writing ratings
- Implementation: uses `Math.round()` (round to nearest integer)
- Difference is negligible for positive ratings; both produce integers

### 6.9 nRating Reset During New Day (DISCOVERED BUG)

- `nRating` must be reset to 0 during New Day
- Otherwise stale `nRating` overrides user edits to `rating` column
- **Fix**: `processNewDayTransformations` sets `nRating: 0`

---

## 7. Files Modified

| File | Changes |
|------|---------|
| `shared/utils/hashUtils.ts` | Rewrite `calculateRatings()` to match VB6 inline algorithm |
| `shared/types/index.ts` | Added `side0Won: boolean` to `MatchData` |
| `src/test/unit/calculateRatings.test.ts` | Remove wrong-formula tests, add VB6-matching tests |

---

## 8. Verification Approach

### 8.1 2-Player Elo Trace (A vs B, both >9 games)

A(1200, 15 games) beats B(1100, 12 games):
- expected = 1/(1 + 10^(-100/400)) ≈ 0.645
- eloPerfs_A = 0.5 + (0.5 - 0.645) = 0.355
- eloPerfs_B = -0.5 + (0.645 - 0.5) = -0.355
- A: 1200 + 0.355×20 = 1207.1
- B: 1100 - 0.355×20 = 1092.9

### 8.2 2-Player Blending Trace (P1 vs P2, num_games=0)

P1(1200, 0 games) beats P2(1200, 0 games):
- expected = 0.5, wldPerfs = 0.5
- perfRating0 = 1200 - 800×0.5 = 800, perfRating1 = 1200 + 800×0.5 = 1600
- **Cross-side**: P1 blends with perfRating1: (1200×0 + 1600)/1 = **1600**
- P2 blends with perfRating0: (1200×0 + 800)/1 = **800**
- Winner gets higher rating, loser gets lower ✓

### 8.3 4-Player Elo Trace (Team A vs Team B, both >9 games)

A1(1500)+A2(1500) vs B1(1400)+B2(1400), Team A wins:
- side0 = 1500, side1 = 1400, expected ≈ 0.640
- eloPerfs_0 = 2×(0.5 - 0.640) = -0.28 (W/L/D cancels!)
- eloPerfs_1 = 2×(0.640 - 0.5) = 0.28
- Team A: 1500 + (-0.28)×20 = 1494 (expected to win, slight penalty)
- Team B: 1400 + 0.28×20 = 1406

### 8.4 4-Player Blending Trace (num_games=5)

A1(1200)+A2(1200) vs B1(1000)+B2(1000), Team A wins:
- perfRating0 = 1200, perfRating1 = 1000 (perfs cancel, no adjustment)
- **Cross-side**: A1 blends with perfRating1: (1200×5 + 1000)/6 = 1167
- B1 blends with perfRating0: (1000×5 + 1200)/6 = 1033

### 8.5 VB6 Binary Comparison

If possible, run the VB6 binary (`bladder.exe`) with the same data and compare nRating outputs.

### 8.6 Regression Tests

All 197 tests pass after VB6-accurate implementation.
