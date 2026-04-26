# Recalculation System — Corrected Implementation (VB6 Match)

> Based on VB6 source at `C:\Users\wxqme\Desktop\Bughouse_ladder\ladder.frm` (Sub recalc, lines 1397-1656)
> Also: `common.bas` (parse_entry, formula, player2row, result_string)

## VB6 → TypeScript Function Mapping

| VB6 Function | TS Function | Location |
|---|---|---|
| `recalc()` | [`calculateRatings()`](shared/utils/hashUtils.ts:1163) | `shared/utils/hashUtils.ts` |
| `formula()` | [`formula()`](shared/utils/hashUtils.ts:113) | `shared/utils/hashUtils.ts` |
| `parse_entry()` | [`parseEntry()`](shared/utils/hashUtils.ts:173) | `shared/utils/hashUtils.ts` |
| `entry2string()` | [`entry2string()`](shared/utils/hashUtils.ts:137) | `shared/utils/hashUtils.ts` |
| `string2long()` | [`string2long()`](shared/utils/hashUtils.ts:405) | `shared/utils/hashUtils.ts` |
| `long2string()` | [`long2string()`](shared/utils/hashUtils.ts:417) | `shared/utils/hashUtils.ts` |
| `DataHash()` | inline in [`processGameResults()`](shared/utils/hashUtils.ts:481) | `shared/utils/hashUtils.ts` |
| `reset_hash()` | inline in [`processNewDayTransformations()`](shared/utils/constants.ts:45) | `shared/utils/constants.ts` |
| `player2row()` | inline in [`processGameResults()`](shared/utils/hashUtils.ts:481) | `shared/utils/hashUtils.ts` |
| `isvalid()` | `playedToday.has()` in [`calculateRatings()`](shared/utils/hashUtils.ts:1163) | `shared/utils/hashUtils.ts` |
| `result_string` | `RESULT_STRING` constant | `shared/utils/hashUtils.ts` |
| `processNewDayTransformations()` | [`processNewDayTransformations()`](shared/utils/constants.ts:44) | `shared/utils/constants.ts` |

---

## 1. Overview of Changes

| # | Change | Detail |
|---|---|---|
| 1 | **Self-based perfRating** | `ownRating + multiplier * wldPerfs` (not opponent-based) |
| 2 | **4p multiplier = 200** | Per result: wldPerfs accumulates ±0.5 per game, multiplier 200 per result |
| 3 | **2p multiplier = 800** | Single result only, wldPerfs ±0.5, 800 × 0.5 = 400 effective |
| 4 | **Elo expected multiplier** | 2p: 1× always; 4p dual: 2× (VB6 loop runs once per game) |
| 5 | **nRating minimum 1** | VB6 line 1613: `If nrating(i) < 1 Then nrating(i) = 1` |
| 6 | **Rating cap 1800** | num_games=0 players capped at 1800 on initialization |
| 7 | **Double-pass averaging** | Always used; dampens extreme swings for new players |
| 8 | **Dual result support** | Both 2p and 4p can have 1 or 2 independent game results |

---

## 2. VB6 Algorithm Analysis

### 2.0 VB6 `scores` Array — Critical Distinction

**`common.bas` line 90:** `result_string = "OLDWXYZ__________"` (TS: `RESULT_STRING` constant)
- O=0, L=1, D=2, W=3 (InStr position - 1)

**`common.bas` lines 223-226:** `score(0)` and `score(1)` parsed from result string
- **2-player:** only 1 result char → `scores(0)` = result, `scores(1)` = 0
- **4-player:** 2 result chars → `scores(0)` = side 0 result, `scores(1)` = side 1 result

**Dual results:** Both 2p and 4p can have a second result (score2 > 0). The wldPerfs loop accumulates ±0.5 for each result independently.

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
- Rating capped at 1200 for num_games=0 (TS uses 1800 cap)
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
    ' === UPDATE EACH PLAYER ===
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
        Chess.TextMatrix(i, nrating_field) = Str$(Int(nrating(i)))
    Else
        Chess.TextMatrix(i, nrating_field) = "0"
    End If
Next
```

**Line 1613: Minimum nRating**
```vb
If nrating(i) < 1 Then nrating(i) = 1
```

### 2.2 TS Implementation — Self-Based PerfRating

The VB6 uses `sides(1-myside)` for blending (cross-side). However, the VB6 perfRating formula already incorporates a cross-side operation (`sides(0) += 800*perfs(1)`). These two cross-ops cancel, making the effective blend **self-based**:

- Side 0 players blend with: `sides(1-myside)` = `sides(1)` = `side1 + 800*perfs(0)` = `side1 + 800*own_wldPerfs`
- But for 4p with the ×2/÷2 trick: effective multiplier is halved

**Our TS approach simplifies this to:** `ownRating + multiplier * wldPerfs`
- **2p:** `ownRating + 800 * wldPerfs` (ownRating = sideRating)
- **4p:** `ownRating + 200 * wldPerfs` (per-player, per-result)

### 2.3 Dual Results

Both 2p and 4p games can have 1 or 2 independent game results. The wldPerfs loop accumulates ±0.5 per result:
- Single result: wldPerfs = ±0.5
- Dual result (both won): wldPerfs = ±1.0
- Dual result (split): wldPerfs = 0

---

## 3. Corrected Algorithm

### 3.1 Match Processing

For each match:

1. **Compute side ratings:**
   - 2-player: `side[0] = nrating(p1)`, `side[1] = nrating(p2)`
   - 4-player: `side[0] = (nrating(p1) + nrating(p2)) / 2`, `side[1] = (nrating(p3) + nrating(p4)) / 2`

2. **Compute expected score:**
   ```typescript
   expected = 1 / (1 + 10^((abs(side1) - abs(side0)) / 400))
   ```

3. **W/L/D component** (accumulate per result):
   ```typescript
   wldPerfs0 = 0; wldPerfs1 = 0;
   for each score in [score1, score2 (if > 0)]:
     if score == 3: wldPerfs0 += 0.5; wldPerfs1 -= 0.5
     if score == 1: wldPerfs0 -= 0.5; wldPerfs1 += 0.5
   ```

4. **PerfRating for blending** (self-based):
   - 2-player: `perfRating = ownRating + 800 * wldPerfs`
   - 4-player: `perfRating = ownRating + 200 * wldPerfs` (per-player)
   - Clamp: `perfRating = max(0, perfRating)`

5. **Elo perfs** (expected diff added once per result):
   - 2-player: `eloPerfs = wldPerfs + 1 * (0.5 - expected)`
   - 4-player dual: `eloPerfs = wldPerfs + 2 * (0.5 - expected)`
   - 4-player single: `eloPerfs = wldPerfs + 1 * (0.5 - expected)`

6. **Update nRating:**
   - `num_games > 9`: `nRating += eloPerfs * kFactor` (Elo accumulation)
   - `num_games <= 9`: `nRating = (nRating * num_games + perfRating) / (num_games + 1)` (self-based blending)
   - Store: `nRating = abs(nRating)`
   - Increment: `num_games++`

### 3.2 Key Differences from Original Code

| Aspect | Original (wrong) | Correct (current) |
|---|---|---|
| PerfRating base | Opponent side rating | **Own rating** (self-based) |
| 2p multiplier | 800 | 800 |
| 4p multiplier | 400 (per side) | **200** (per player, per result) |
| Blending | Cross-side (`sides(1-myside)`) | Self-based (own perfRating) |
| >9 games Elo | Fresh calculation | Incremental (`nRating += eloPerfs * K`) |
| Elo perfs 2p | `±0.5 + 2×(0.5-exp)` | `±0.5 + 1×(0.5-exp)` |
| Elo perfs 4p dual | Same as 2p | `wldPerfs + 2×(0.5-exp)` |
| Elo perfs 4p single | Same as 2p | `wldPerfs + 1×(0.5-exp)` |
| Dual results | 4p only, always dual | Both 2p and 4p, 30% dual in stress test |
| nRating minimum | 0 | **1** (VB6 line 1613) |
| Rating cap | 1200 | **1800** |
| Double-pass | Optional | **Always** |

---

## 4. Expected Behavior

### 4.1 Elo Perfs Examples (2-player, >9 games, single result)

| Scenario | eloPerfs | Elo Change (K=20) |
|---|---|---|
| Win vs equal (expected=0.5) | `0.5 + (0.5-0.5) = 0.5` | +10 |
| Win vs weaker (expected=0.75) | `0.5 + (0.5-0.75) = 0.25` | +5 |
| Win vs stronger (expected=0.25) | `0.5 + (0.5-0.25) = 0.75` | +15 |
| Draw vs equal (expected=0.5) | `0 + (0.5-0.5) = 0` | 0 |
| Loss vs equal (expected=0.5) | `-0.5 + (0.5-0.5) = -0.5` | -10 |

### 4.2 Elo Perfs Examples (4-player, >9 games, dual result — both won)

| Scenario | eloPerfs | Elo Change (K=20) |
|---|---|---|
| Won both vs equal (expected=0.5) | `1.0 + 2*(0.5-0.5) = 1.0` | +20 |
| Won both vs weaker (expected=0.75) | `1.0 + 2*(0.5-0.75) = 0.5` | +10 |
| Won both vs stronger (expected=0.25) | `1.0 + 2*(0.5-0.25) = 1.5` | +30 |
| Split (each won 1) vs equal | `0 + 2*(0.5-0.5) = 0` | 0 |
| Split vs weaker (expected=0.75) | `0 + 2*(0.5-0.75) = -0.5` | -10 |
| Lost both vs stronger (expected=0.25) | `-1.0 + 2*(0.75-0.5) = -0.5` | -10 |

### 4.3 Blending Examples (4-player, <10 games, dual result — both won)

**Example: 100+900 vs 400+600, side 0 wins both games**

PerfRating (self-based, multiplier 200):
- P1 (100): `100 + 200 * 1.0 = 300`
- P2 (900): `900 + 200 * 1.0 = 1100`
- P3 (400): `400 + 200 * (-1.0) = 200`
- P4 (600): `600 + 200 * (-1.0) = 400`

Each player blends with their own perfRating:
- P1 (num_games=0): `(100*0 + 300) / 1 = 300`
- P2 (num_games=0): `(900*0 + 1100) / 1 = 1100`
- P3 (num_games=0): `(400*0 + 200) / 1 = 200`
- P4 (num_games=0): `(600*0 + 400) / 1 = 400`

### 4.4 Blending Examples (2-player, <10 games, single result)

**Example: P1(1200) beats P2(1200), num_games=5**

PerfRating (self-based, multiplier 800):
- P1: `1200 + 800 * 0.5 = 1600`
- P2: `1200 + 800 * (-0.5) = 800`

Blending:
- P1: `(1200*5 + 1600) / 6 = 1267`
- P2: `(1200*5 + 800) / 6 = 1133`

### 4.5 Experienced Players (>9 games)

Incremental Elo accumulation. Each match adjusts the current nRating by `eloPerfs * kFactor`. Multiple matches accumulate.

---

## 5. Edge Cases

### 5.1 Zero/Blank Ratings
- `num_games === 0` → use nRating from file, cap at 1800
- `num_games > 0` → use rating column

### 5.2 Negative Performance Rating
- Clamped to 0: `perfRating = max(0, perfRating)`

### 5.3 nRating Minimum
- VB6 line 1613: `If nrating(i) < 1 Then nrating(i) = 1`
- Applied after each pass and after averaging
- Players who didn't play get `nRating = 0`

### 5.4 trophyEligible Preservation
- Determined by `rating` column sign
- Never touched during recalculation
- Set at file I/O time

### 5.5 Rating Column NOT Updated During Recalc
- Only `nrating_field` updated during recalc
- `rating_field` only updated during New Day

---

## 6. Verification Traces

### 6.1 2-Player Elo Trace (A vs B, both >9 games)

A(1200, 15 games) beats B(1100, 12 games):
- expected = 1/(1 + 10^(-100/400)) ≈ 0.645
- eloPerfs_A = 0.5 + (0.5 - 0.645) = 0.355
- eloPerfs_B = -0.5 + (0.645 - 0.5) = -0.355
- A: 1200 + 0.355×20 = 1207.1
- B: 1100 - 0.355×20 = 1092.9

### 6.2 2-Player Blending Trace (P1 vs P2, num_games=0)

P1(1200, 0 games) beats P2(1200, 0 games):
- expected = 0.5, wldPerfs = 0.5
- perfRating P1 = 1200 + 800×0.5 = 1600
- perfRating P2 = 1200 + 800×(-0.5) = 800
- P1: (1200×0 + 1600)/1 = **1600**
- P2: (1200×0 + 800)/1 = **800**

### 6.3 4-Player Elo Trace (Team A vs Team B, dual result, both won)

A1(1500)+A2(1500) vs B1(1400)+B2(1400), Team A wins both:
- side0 = 1500, side1 = 1400, expected ≈ 0.640
- wldPerfs_0 = 1.0, wldPerfs_1 = -1.0
- eloPerfs_0 = 1.0 + 2×(0.5 - 0.640) = 0.720
- eloPerfs_1 = -1.0 + 2×(0.640 - 0.5) = -0.720
- Team A: 1500 + 0.720×20 = 1514
- Team B: 1400 - 0.720×20 = 1386

### 6.4 4-Player Blending Trace (num_games=5, split result)

A1(1200)+A2(1200) vs B1(1000)+B2(1000), split (each won 1):
- wldPerfs = 0 (cancel), perfRating = ownRating (no adjustment)
- A1: (1200×5 + 1200)/6 = 1200
- B1: (1000×5 + 1000)/6 = 1000

### 6.5 Regression Tests

All 468 tests pass (2 skipped).
