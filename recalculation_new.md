# Recalculation System — Corrected Implementation (VB6 Match)

> Based on VB6 source at `C:\Users\wxqme\Desktop\Bughouse_ladder\ladder.frm` (Sub recalc, lines 1397-1656)

---

## 1. Overview of Changes

Three bugs in the current implementation need fixing:

| # | Bug | Current (wrong) | VB6 (correct) | Impact |
|---|---|---|---|---|
| 1 | **Performance formula** | `avg ± 200` (fixed bonus) | `avg + 800 * (actual - expected)` | 100% win rate gives +200 instead of +400+ |
| 2 | **Blending timing** | Post-loop with `perfBlendingFactor` | Inline during match processing | New players get wrong weights |
| 3 | **Elo for >9 games** | Fresh `nRating = abs(round(rating + K*(actual-expected)))` | `nRating += perfs * kFactor` (accumulates) | Experienced players don't accumulate properly |

---

## 2. VB6 Algorithm Analysis

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
    For myplayer = 0 To 1
        If scores(myplayer) > 0 Then
            Select Case scores(myplayer)
                Case 3: perfs(0) += 0.5: perfs(1) -= 0.5
                Case 2: ' draw: no change
                Case 1: perfs(0) -= 0.5: perfs(1) += 0.5
            End Select
        End If
    Next
    If scores(1) > 0 Then sides(0) *= 2: sides(1) *= 2
    sides(0) = sides(0) + 800 * perfs(1)
    sides(1) = sides(1) + 800 * perfs(0)
    If scores(1) > 0 Then sides(0) /= 2: sides(1) /= 2
    If sides(0) < 0 Then sides(0) = 0
    If sides(1) < 0 Then sides(1) = 0
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

```typescript
interface PlayerGameStats {
    scoreError: number;      // Accumulated (actual - expected) per side
    scoreError4Player: number; // For 4-player: accumulated error for the opposing side
    perfAccum: number;       // Accumulated performance rating (sides)
    perfCount: number;       // Games played (num_games increment)
}
```

### 3.2 Match Processing (inline, replaces Elo loop + post-loop)

For each match:

1. **Compute side ratings:**
   - 2-player: `side[0] = nrating(p1)`, `side[1] = nrating(p2)`
   - 4-player: `side[0] = (nrating(p1) + nrating(p2)) / 2`, `side[1] = (nrating(p3) + nrating(p4)) / 2`

2. **Compute expected score:**
   ```typescript
   expected = formula(side[0], side[1])
   ```

3. **Compute per-side score error:**
   - For each player on side 0:
     - Win (score=3): `perfs[0] += 0.5`, `perfs[1] -= 0.5`
     - Loss (score=1): `perfs[0] -= 0.5`, `perfs[1] += 0.5`
     - Draw (score=2): no change
   - For 4-player: double the sides, accumulate error for opposing side

4. **Compute performance rating:**
   ```typescript
   perfRating[0] = side[0] + 800 * perfs[1]  // 800 = 2 * 400 (Elo constant)
   perfRating[1] = side[1] + 800 * perfs[0]
   ```

5. **Clamp:** `perfRating = max(0, perfRating)`

6. **Update nRating:**
   - `num_games > 9`: `nRating += perfs * kFactor` (pure Elo accumulation)
   - `num_games <= 9`: `nRating = (nRating * num_games + perfRating) / (num_games + 1)` (blended)
   - Store: `nRating = abs(nRating)`
   - Increment: `num_games++`

### 3.3 Key Differences from Current Code

| Aspect | Current (wrong) | Correct (VB6) |
|---|---|---|
| Performance formula | `avg ± 200` | `avg + 800 * (actual - expected)` |
| Blending | Post-loop, `perfBlendingFactor` used | Inline per-game, no damping factor |
| >9 games Elo | Fresh `nRating = abs(round(rating + K*(actual-expected)))` | `nRating += perfs * kFactor` (incremental) |
| 4-player sides | Uses individual player ratings | Average of team members |
| 4-player perf | Not distinguished | Doubles sides, accumulates opposing error |
| Score error | Not tracked | Accumulated per side via `perfs` |

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
- `scoreError` per player (accumulates `actual - expected`)
- `scoreError4Player` for 4-player opposing side error
- `perfRating` per side computed inline using `800 * scoreError`
- Blending inline: `nRating = (nRating * num_games + perfRating) / (num_games + 1)` for `num_games <= 9`
- Elo accumulation inline: `nRating += scoreError * kFactor` for `num_games > 9`
- `num_games++` after each match processed

**Preserve:**
- `trophyEligible` — never touched during recalculation (set at file I/O time)
- `effectiveRatings` map can be removed entirely

### 4.2 `shared/utils/hashUtils.ts` — `processGameResults()`

**No changes needed** — validation, dedup, and conflict detection are correct.

### 4.3 `shared/utils/constants.ts` — `processNewDayTransformations()`

**No changes needed** — already correctly:
- Uses `trophyEligible` to decide whether rating goes negative
- Resets gameResults, updates num_games, attendance

### 4.4 `shared/types/index.ts` — PlayerData

**No changes needed** — `trophyEligible` field already present.

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

### 5.1 Performance Rating Examples

| Scenario | Current | VB6 (correct) |
|---|---|---|
| 100% win vs equal opponent | +200 | +400 |
| 100% win vs weaker opponent | +200 | +400 to +800 (depends on rating gap) |
| 100% win vs stronger opponent | +200 | +200 to +400 |
| 50% win rate | +0 | +0 |
| 25% win rate | -200 | -200 to -400 |
| 0% win rate | -200 | -400 |

### 5.2 Blending for New Players

| num_games | Current | VB6 |
|---|---|---|
| 0 | Raw perfRating (no damping) | Raw perfRating (capped at 1200) |
| 3 | `0.99 * ((rating * 3 + perf * 1) / 4)` | `(nRating * 3 + perf * 1) / 4` per game |
| 9 | `0.99 * ((rating * 9 + perf * 1) / 10)` | `(nRating * 9 + perf * 1) / 10` per game |

The VB6 blends one game at a time, so the weight of each game is `1/(num_games+1)`. The current approach uses `gamesToday` as the weight for performance, which is wrong — it should be career history (`num_games`) as the weight for historical rating.

### 5.3 Experienced Players (>9 games)

| Aspect | Current | VB6 |
|---|---|---|
| Formula | Fresh `nRating = abs(round(rating + K*(actual-expected)))` | `nRating += (actual-expected) * K` |
| Consistency | Depends on match processing order | Same — both accumulate |
| Starting point | Always from `rating` (old rating) | From accumulated nRating |

The VB6 approach means experienced players start from their current nRating and adjust incrementally. The current approach recalculates from scratch each time, which can produce different results if the match order changes.

---

## 6. Edge Cases to Handle

### 6.1 Zero/Blank Ratings

- VB6: `num_games === 0` → use nRating from file, cap at 1200
- Current: `num_games === 0` → use perfRating directly
- Fix: match VB6 behavior

### 6.2 Negative Performance Rating

- VB6: `If sides(0) < 0 Then sides(0) = 0` — clamp to 0
- Current: no clamping (allows negatives, uses abs later)
- Fix: clamp perfRating to 0 before blending

### 6.3 4-Player Score Error

- VB6: doubles sides, accumulates opposing side error
- Current: not distinguished (treats 4-player same as 2-player)
- Fix: accumulate `scoreError4Player` for opposing team in 4-player games

### 6.4 trophyEligible Preservation

- VB6: sign determined by `rating` column, written to `nrating_field`
- Current: never touched during recalculation (correct!)
- No change needed

---

## 7. Files Modified

| File | Changes |
|------|---------|
| `shared/utils/hashUtils.ts` | Rewrite `calculateRatings()` to match VB6 inline algorithm |
| `src/test/unit/calculateRatings.test.ts` | Remove wrong-formula tests, add VB6-matching tests |

---

## 8. Verification Approach

### 8.1 Manual Trace

Use 3 players with known ratings and results:

| Player | Rating | Career Games | Results |
|---|---|---|---|
| A | 1200 | 15 | W vs B, W vs C |
| B | 1100 | 12 | L vs A, W vs C |
| C | 1000 | 8 | L vs A, L vs B |

**Expected VB6 results:**

- A vs B: sides = (1200, 1100), expected = formula(1200, 1100) ≈ 0.567
  - perfs: A = 0.5 - 0.567 = -0.067, B = 0.567 - 0.5 = 0.067
  - perfRating A = 1200 + 800*(0.067) = 1253
  - perfRating B = 1100 + 800*(-0.067) = 1046
  - A: num_games=15 > 9 → nRating += (-0.067) * K
  - B: num_games=12 > 9 → nRating += (0.067) * K

- A vs C: sides = (1200, 1000), expected = formula(1200, 1000) ≈ 0.760
  - perfs: A = 0.5 - 0.760 = -0.260, C = 0.760 - 0.5 = 0.260
  - perfRating A = 1200 + 800*(0.260) = 1408
  - perfRating C = 1000 + 800*(-0.260) = 792
  - A: nRating += (-0.260) * K
  - C: num_games=8 ≤ 9 → nRating = (nRating * 8 + 792) / 9

Compare against current implementation to quantify the difference.

### 8.2 VB6 Binary Comparison

If possible, run the VB6 binary (`bladder.exe`) with the same data and compare nRating outputs.

### 8.3 Regression Tests

After implementing the fix, run all existing tests. Some will fail because they were based on the wrong formula — update them to match VB6 behavior.
