# Rating Recalculation Logic

## Overview

The Bughouse ladder implements a modified Elo rating system designed for 4-player bughouse chess (two teams of 2). The core recalculation happens in the `recalc()` subroutine in `ladder.frm`, with the expected-score formula in `common.bas`.

---

## The Expected Score Formula

Located in `common.bas:129-131`:

```vb
Function formula(my_rating As Double, opponents_rating As Double) As Double
    formula = 1# / (1# + 10# ^ ((Abs(opponents_rating) - Abs(my_rating)) / 400#))
End Function
```

This is the **standard Elo expected score**:

```
E = 1 / (1 + 10^((R_opponent - R_my) / 400))
```

Where:
- `E` = expected score for `my_rating` side (0 to 1)
- `R_my` = absolute rating of the player's side
- `R_opponent` = absolute rating of the opposing side
- `400` = the Elo scaling factor (standard)

**Note:** `Abs()` is used throughout, meaning sign is only for display (negative ratings = suspended/inactive players).

---

## K-Factor

The K-factor controls how much a single game affects ratings:
- **Default:** 32 (set in `ladder.ini`, line 1)
- **Configurable:** Via the Settings form (`Settings!K_Factor.Text`)
- **Variable behavior:** The K-factor is only applied directly for players with **more than 9 games**. New players use a weighted average instead (see below).

---

## Game Entry Format

Games are stored as compact strings in grid cells. Format:

```
P1:P2RS:P3:P4
```

Where:
- `P1:P2` = Team A players (row indices, P1 < P2)
- `P3:P4` = Team B players (row indices, P3 < P4)
- `R` = Team A result: `W` (win), `L` (loss), `D` (draw)
- `S` = Team B result (optional): `W`, `L`, `D`, or empty (inferred from R)

Example: `23:29LW31:28` means:
- Team A: players rows 23 & 29
- Team A result: Loss
- Team B result: Win
- Team B: players rows 31 & 28 (stored as 28:31 internally)

The `result_string` constant (`common.bas:90`) defines the encoding:
```vb
Global Const result_string As String = "OLDWXYZ__________"
```
- Index 0 = `O` (old/unknown)
- Index 1 = `L` (loss)
- Index 2 = `D` (draw)
- Index 3 = `W` (win)

`parse_entry()` in `common.bas:155-271` parses these strings into player arrays and score arrays.

---

## Side Rating Calculation

For bughouse (4-player), the rating of a **side** (team) is the **average of its two players**:

```vb
' ladder.frm:1479-1485
If players(1) > 0 Then
    sides(0) = (nrating(players(0)) + nrating(players(1))) / 2
    sides(1) = (nrating(players(4)) + nrating(players(3))) / 2
Else
    sides(0) = nrating(players(0))
    sides(1) = nrating(players(3))
End If
```

- `players(0)` and `players(1)` = Team A
- `players(3)` and `players(4)` = Team B
- If `players(1) = 0`, it's a 2-player game (no partner), so use individual rating

---

## Performance Adjustment

Before computing the Elo rating delta, the system adjusts the side ratings based on the game outcome to compute a "performance rating" for the game:

```vb
' ladder.frm:1486-1513
perf = formula(sides(0), sides(1))

' perfs(0) and perfs(1) start at 0
' Adjust based on score outcome:
For myplayer = 0 To 1
    If scores(myplayer) > 0 Then
        Select Case scores(myplayer)
            Case 3: ' Win (W)
                perfs(0) = perfs(0) + 0.5
                perfs(1) = perfs(1) - 0.5
            Case 2: ' Draw (D)
                ' no adjustment
            Case 1: ' Loss (L)
                perfs(0) = perfs(0) - 0.5
                perfs(1) = perfs(1) + 0.5
        End Select
    End If
Next

' Scale side ratings for individual game scoring
If scores(1) > 0 Then
    sides(0) = sides(0) * 2
    sides(1) = sides(1) * 2
End If

' Add performance offset (800 * perfs)
sides(0) = sides(0) + 800 * perfs(1)
sides(1) = sides(1) + 800 * perfs(0)

If scores(1) > 0 Then
    sides(0) = sides(0) / 2
    sides(1) = sides(1) / 2
End If

' Clamp to non-negative
If sides(0) < 0 Then sides(0) = 0
If sides(1) < 0 Then sides(1) = 0
```

The `800 * perfs` offset represents a full rating swing:
- Win: `+400` performance offset for the winner's side
- Loss: `-400` performance offset for the loser's side
- Draw: `0` offset

Then the Elo delta is computed:

```vb
' ladder.frm:1514-1519
For myplayer = 0 To 1
    If scores(myplayer) > 0 Then
        perfs(0) = perfs(0) + (0.5 - perf)
        perfs(1) = perfs(1) + (perf - 0.5)
    End If
Next
```

This adds `(actual_score - expected_score)` to `perfs`, where:
- Win adds `0.5 - perf` (positive if underdog, negative if favorite)
- Loss adds `-0.5 - perf` (negative if underdog, positive if favorite)
- Draw adds `0 - perf` (positive if underdog, negative if favorite)

---

## Rating Update: Two Modes

### Established Players (>= 10 games)

Standard Elo update:

```vb
' ladder.frm:1525-1526
If num_games(players(pl)) > 9 Then
    nrating(players(pl)) = nrating(players(pl)) + perfs(myside) * k_val
```

Where:
- `perfs(myside)` = accumulated performance delta for the player's side
- `k_val` = K-factor (default 32)

This is equivalent to:
```
R_new = R_old + K * (S_actual - E_expected)
```

### New Players (< 10 games)

Weighted average with performance rating:

```vb
' ladder.frm:1527-1528
Else
    nrating(players(pl)) = (nrating(players(pl)) * num_games(players(pl)) + sides(1 - myside)) / (num_games(players(pl)) + 1)
End If
```

Where:
- `sides(1 - myside)` = the **opponent's** adjusted side rating (performance rating)
- This effectively sets the new player's rating toward the opponent's strength

**Note:** The `sides()` values at this point have already been adjusted by the performance offset, so they represent the opponent's "performance-adjusted" rating for this game.

### Post-Processing

```vb
' ladder.frm:1529-1531
nrating(players(pl)) = Abs(nrating(players(pl)))
num_games(players(pl)) = num_games(players(pl)) + 1
```

Rating is always absolute (non-negative), and game count is incremented.

---

## Initial Rating

When a player has 0 games, their starting rating comes from the `nrating_field`:

```vb
' ladder.frm:1441-1447
If num_games(i) = 0 Then
    perf = Val(Chess.TextMatrix(i, nrating_field))
    If perf > 1200 Then perf = 1200
    nrating(i) = Abs(perf)
Else
    nrating(i) = Abs(perf)
End If
```

New players are **capped at 1200** initial rating.

---

## Recalc Modes

The `recalc(Index)` subroutine has three modes controlled by `Index`:

| Index | Trigger | Behavior |
|-------|---------|----------|
| **0** | Enter key, "Recalc Ratings" menu | Recalculate ratings, place games in grid cells |
| **2** | "New day" menu | Recalc + commit ratings + re-rank + clear hash + save |
| **3** | "New Day wo ReRank" menu | Recalc + commit ratings + clear hash + save (no re-rank) |

### Index 0 (Recalc Only)
- Processes all pending game entries from the grid
- Computes new ratings in `nrating()` array
- Places game entries back into the grid (for display)
- Updates `nrating_field` column with new ratings
- Does **not** commit ratings to `rating_field`

### Index 2 (New Day with Re-Rank)
Everything in Index 0, plus:
- Commits `nrating` to `rating_field` for all players
- Resets attendance field (`X` → empty, numeric → increment)
- Resets hash table (clears processed games)
- Sets ranking field to row index (re-ranks by grid order)
- Saves all files and generates HTML

### Index 3 (New Day without Re-Rank)
Same as Index 2, but does **not** reassign ranking numbers.

---

## Hash Table Deduplication

Game entries are stored in a hash table (`common.bas:327-368`) to deduplicate games. When a game is entered for one player, the same game appears for all 4 players. The hash table ensures each game is only processed once during recalculation.

```vb
' Adding a game to the hash:
Call DataHash(my_text$, my_text$, 0)

' Processing games from the hash:
For i = 1 To hashsize
    my_text$ = hasharray(i)
    If Len(my_text$) Then
        ' process game once
    End If
Next
```

When `Index >= 2` (new day), the hash is cleared: `Call reset_hash(0)`

---

## Negative Ratings

A negative value in `rating_field` indicates a **suspended** or **inactive** player. The sign is preserved through recalculation:

```vb
' ladder.frm:1601-1609
If (Val(Chess.TextMatrix(i, rating_field)) < 0) Then
    Chess.TextMatrix(i, nrating_field) = Str$(-Int(nrating(i)))
Else
    Chess.TextMatrix(i, nrating_field) = Str$(Int(nrating(i)))
End If
```

The actual rating math always uses `Abs()`, so negative ratings still participate in calculations normally.

---

## Summary: Complete Rating Update Flow

For each game in the hash table:

1. **Parse** the game entry string into 4 players and 2 team scores
2. **Compute side ratings**: average of two teammates' ratings
3. **Compute expected score** (`perf`) using the Elo formula on side ratings
4. **Compute performance offset**: `800 * (±0.5)` based on win/loss/draw
5. **Compute adjusted side ratings**: `side_rating + performance_offset`
6. **Compute Elo delta**: `(actual - expected)` added to performance
7. **Update each player's rating**:
   - If >= 10 games: `R + K * delta` (standard Elo)
   - If < 10 games: weighted average with opponent's adjusted rating
8. **Increment** game count for all 4 players
9. **Take absolute value** of all ratings

---

## Key Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `grows_max` | 200 | `common.bas:3` | Maximum number of players |
| `player_size` | 128 | `common.bas:83` | Modulo for player ID encoding |
| `game_size` | 4 | `common.bas:84` | Modulo for result encoding |
| `result_string` | `"OLDWXYZ__________"` | `common.bas:90` | Result character encoding |
| `begin_hashsize` | 16383 | `common.bas:39` | Hash table initial size |
| K-Factor default | 32 | `ladder.ini` line 1 | Rating adjustment multiplier |
| New player cap | 1200 | `ladder.frm:1443` | Maximum initial rating |
| Experience threshold | 10 | `ladder.frm:1525` | Games before standard Elo kicks in |
| Performance swing | 800 | `ladder.frm:1506-1507` | Rating offset for win/loss |
