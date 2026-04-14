# Bughouse Chess Ladder - User Manual

## Table of Contents

1. [Overview](#overview)
2. [Entering Game Results](#entering-game-results)
3. [Game Result Formats](#game-result-formats)
4. [Error Checking and Correction](#error-checking-and-correction)
5. [Understanding Errors](#understanding-errors)
6. [Bulk Operations](#bulk-operations)
7. [Tips and Best Practices](#tips-and-best-practices)

---

## Overview

The Bughouse Chess Ladder tracks player ratings using the Elo rating system. Game results are entered in a compact format that encodes opponents and outcomes in a single cell.

### Key Concepts

- **Rank**: Each player is assigned a unique rank number (1, 2, 3, ...)
- **Round**: Each game session is a round (round 1, round 2, etc.)
- **Result String**: A compact notation describing who played whom and who won

---

## Entering Game Results

### Method 1: Direct Cell Entry

**Best for:** Entering one game result at a time

1. Locate the player's row in the ladder
2. Find the round number (column) where you want to enter the result
3. Click on the cell
4. Enter the result string in the dialog that appears
5. Click "Save"

**Example:** Player 5 played in round 1 against players 6, 7, and 8
- Click on row 5, column 1
- Enter: `5:6W7:8`
- Click Save

### Method 2: Enter Games Mode

**Best for:** Systematically entering all games round by round

1. Go to **Operations → Enter Games**
2. A dialog opens showing the first empty cell
3. Enter the result string
4. Click "Enter_Recalculate_Save" to:
   - Save the result
   - Automatically recalculate ratings
   - Jump to the next empty cell
5. Repeat until all games are entered

**Keyboard shortcuts in Enter Games mode:**
- `Enter` or `Ctrl+S`: Save and move to next cell
- `Escape` or `Ctrl+X`: Cancel and exit

### Method 3: Error Correction Entry

**Best for:** Fixing invalid or conflicting results

When errors are detected (automatically after recalculation or via Check Errors):

1. Click "Continue with corrections" button
2. The error dialog shows:
   - The original invalid string
   - The error message
   - Which round and player is affected
3. Enter the corrected result string
4. Click "Submit Correction"
5. Automatically moves to next error (if any)

### Method 4: Bulk Paste

**Best for:** Entering many results quickly from a spreadsheet or text file

1. Prepare your results in a text editor or spreadsheet (e.g., LibreOffice Calc) with tab-separated values
2. Copy the results to clipboard
3. Go to **Operations → Paste Multiple Results**
4. Or simply paste directly into any game result cell
5. The system will:
   - Detect multiple tab-separated results
   - Apply the first result to current cell
   - Store remaining results for subsequent entries

**Example clipboard content:**
```
1:2W3:4	5:6L7:8	9:10D11:12
```

This will enter three separate game results in sequence.

---

## Game Result Formats

### Format Overview

Game results use a compact notation encoding:
- **Player ranks** (who played)
- **Results** (W = Win, L = Loss, D = Draw)

**Important:** 4-player games are TEAM games. Two teams of two players play TWO games against each other. All teammates share the same results (e.g., both get W, or both get L).

### 2-Player Games

#### Single Result
```
Format: A_R_B
Meaning: Player A plays Player B, result _ applies to Player A

Examples:
  2W3  → Player 2 BEATS Player 3 (2 wins)
  5L7  → Player 5 LOSES to Player 7 (7 wins)
  3D8  → Player 3 DRAWS with Player 8
```

#### Double Result (Two Games)
```
Format: A_R1_R2_B
Meaning: Player A plays Player B twice, results _1_ and _2_ apply to Player A

Examples:
  3WL4  → Player 3 vs Player 4: Win then Loss (split)
  5WW6  → Player 5 BEATS Player 6 twice
  7LL8  → Player 7 LOSES both games to Player 8
```

### 4-Player Games (Team vs Team)

```
Format: A:B_R_C:D or A:B_R1_R2_C:D
Meaning:
  - Team 1: Players A and B (partners)
  - Team 2: Players C and D (partners)
  - _R_, _R1_, _R2_ = Result(s) for Team 1 (W/L/D)
  - Two teams play TWO games against each other
  - Single result = one game played; Double result = both games played

Examples:
  5:6W7:8  → 
    Team of 5 & 6 plays ONE game against Team of 7 & 8
    Team 5&6 WINS (Team 7&8 loses)

  1:2LL3:4  →
    Team of 1 & 2 plays TWO games against Team of 3 & 4
    Team 1&2 LOSES both games (Team 3&4 wins both)

  5:6WD7:8  →
    Team of 5 & 6 plays TWO games against Team of 7 & 8
    Team 5&6 WINS first game, DRAWS second game (split result)

  9:10D11:12  →
    Team of 9 & 10 draws with Team of 11 & 12 (one game)
    All four players get Draw
```

**Important:** In 4-player team games, teammates always share the same result(s). If you enter `1:2LL3:4`, both players 1 and 2 get two Losses, and both players 3 and 4 get two Wins.

### Result Codes Reference

| Code | Meaning |
|------|--------|
| `W` | Win |
| `L` | Loss |
| `D` | Draw |

---

## Error Checking and Correction

### Automatic Error Detection

Errors are automatically checked when you:
- Click **Operations → Recalculate_Save**
- Enter games in Enter Games mode
- Import data from a file

### Manual Error Check

To check for errors without recalculating:

1. Go to **Operations → Check Errors**
2. Review the error report
3. Click "Continue with corrections" to fix errors

### Types of Checks Performed

1. **Format Validation**: Is the result string properly formatted?
2. **Player Existence**: Do all referenced player ranks exist?
3. **Result Consistency**: Do paired players have matching results?
4. **Logical Validity**: Are results logically consistent (e.g., someone must lose if someone wins)?

---

## Understanding Errors

### Error Code Reference

#### Format Errors

| Error | Meaning | Example | Fix |
|-------|---------|---------|-----|
| **1** | Invalid characters | `ABC` | Use only digits, W, L, D, and colons |
| **2** | Incomplete 2-player game | `5W` | Add opponent: `5W6` |
| **3** | Incomplete 4-player game | `1:2W3:` | Complete the format: `1:2W3:4` |
| **4** | Missing result code | `1:2:3:4` | Add team result: `1:2W3:4` |

#### Player Reference Errors

| Error | Meaning | Example | Fix |
|-------|---------|---------|-----|
| **5** | Player doesn't exist | `15W6` (only 10 players) | Use valid rank or add player |
| **6** | Duplicate player in game | `3:4W3:5` | Player can't play themselves |

#### Consistency Errors

| Error | Meaning | Example | Fix |
|-------|---------|---------|-----|
| **7** | Mismatched opponent results | P1: `1W2`, P2: `2W1` | One must lose if other wins |
| **8** | Invalid double result | `1WW2` when only 1 game played | Check number of games |
| **9** | Teammates with different results | P5: `5:6W7:8`, P6: `5:6L7:8` | Teammates must have same result |

#### Logic Errors

| Error | Meaning | Example | Fix |
|-------|---------|---------|-----|
| **9** | Impossible result combination | Both players show Win | Results must be opposite |
| **10** | Conflicting results | Multiple entries for same game | Check all players' records |

### Reading Error Messages

When an error occurs, the dialog shows:

```
Correction Required - Round 3 of 8

Original String: 5W6L7
Error: Invalid result combination

Enter corrected result string:
[                    ]
```

### Common Error Scenarios

#### Scenario 1: Opponent Entered Wrong Result

**Problem:** You entered `5W6` but Player 6 entered `6W5`

**Solution:**
1. One entry must be corrected
2. If you won: Keep `5W6`, change Player 6's entry to `6L5`
3. If Player 6 won: Change your entry to `5L6`, keep `6W5`

#### Scenario 2: Wrong Player Rank

**Problem:** Entered `15W6` but only 10 players exist

**Solution:**
- If meant Player 5: Change to `5W6`
- If Player 15 is new: Add player via **Operations → Add Player**

#### Scenario 3: Incomplete 4-Player Entry

**Problem:** Entered `1:2W3` (missing last player)

**Solution:** Complete as `1:2W3:4`

---

## Bulk Operations

### Paste Multiple Results

**Use case:** You have results in a spreadsheet (e.g., LibreOffice Calc) or text file

**Steps:**
1. Format results as tab-separated values:
   ```
   1:2W3:4	5:6W7:8	9:10W11:12
   ```
2. Copy to clipboard
3. Go to **Operations → Paste Multiple Results**
4. Click "Paste" in the dialog
5. Results are applied sequentially to empty cells

### Enter Games Mode (Full Walkthrough)

**Use case:** Entering an entire round or tournament

**Steps:**
1. Click **Operations → Enter Games**
2. Dialog shows: "Entering: Round 1 for Player 1"
3. Enter result: `1:2W3:4`
4. Click "Enter_Recalculate_Save"
5. Automatically jumps to next empty cell
6. Continue until all cells filled
7. Press Escape when done

### Clear All Matching Cells

**Use case:** You entered wrong results for a specific game and want to clear them

**Steps:**
1. Open the error dialog for any cell with that result
2. Click "Clear All Matching Cells (Ctrl+C)"
3. All cells containing the same result are cleared
4. Re-enter correct results

---

## Tips and Best Practices

### Entry Tips

1. **Always verify opponent's entry** - After entering your result, check that opponents entered matching results

2. **Team games: all teammates share the same results** - In 4-player team games (format `A:B_W_C:D` or `A:B_WL_C:D`), both teammates get the same result(s). If you enter `1:2LL3:4`, both players 1 and 2 get two Losses.

3. **Use Enter Games mode for batches** - More efficient than cell-by-cell entry

4. **Save frequently** - Changes are auto-saved, but recalculation applies them

5. **Check errors after each round** - Catch mistakes early before they compound

### Common Mistakes to Avoid

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| Entering `5W6` when you lost | Ratings wrong by double the amount | Double-check W/L before saving |
| Wrong player rank | Error or wrong player affected | Verify ranks before entering |
| Forgetting colon in 4-player | Format error | Remember: `A:B_W_C:D` |
| Both players entering Win | Consistency error | Results must be opposite |
| Teammates entering different results | Consistency error | All teammates get same W/L/D |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current entry |
| `Ctrl+C` | Clear cell |
| `Ctrl+X` | Close dialog |
| `Ctrl+N` | Next error (in correction mode) |
| `Ctrl+P` | Previous error (in correction mode) |
| `Escape` | Close dialog |

### Verification Checklist

After entering games for a round:

- [ ] All players who played have an entry
- [ ] No format errors remain
- [ ] Opponent results are consistent (if you Win, they Lose)
- [ ] Recalculated ratings look reasonable
- [ ] No unexpected rating jumps

---

## Quick Reference Cards

### 2-Player Format Quick Reference

```
You Win:     YourRank W OpponentRank    Example: 5W7
You Lose:    YourRank L OpponentRank    Example: 5L7
You Draw:    YourRank D OpponentRank    Example: 5D7

Two Games:
Split:       YourRank WL OpponentRank   Example: 5WL7
Win Both:    YourRank WW OpponentRank   Example: 5WW7
Lose Both:   YourRank LL OpponentRank   Example: 5LL7
```

### 4-Player Format Quick Reference

```
Format: P1:P2_Result_P3:P4 or P1:P2_Result1_Result2_P3:P4

Where:
  P1, P2 = Your team (partners)
  P3, P4 = Opponent team
  Result(s) = Team result(s) for your team (W/L/D, or two results)

Two teams play TWO games - enter one or two results:

Examples:
  You are Player 5, your partner is 6:
    One game, your team wins:   5:6W7:8  (Players 5,6 get Win; Players 7,8 get Loss)
    Two games, your team loses both: 5:6LL7:8  (Players 5,6 get two Losses; Players 7,8 get two Wins)
    Two games, split result:     5:6WL7:8  (Player 5,6 win first, lose second)
    One game, teams draw:        5:6D7:8  (All four players get Draw)
```

---

## Examples by Scenario

### Example 1: Simple 2-Player Game

**Situation:** Player 3 beats Player 7

**Entry for Player 3:** `3W7`
**Entry for Player 7:** `7L3`

### Example 2: 4-Player Team Game (Your Team Wins One Game)

**Situation:** Team of Players 1&2 plays ONE game against Team of Players 5&6. Team 1&2 wins.

**Entries (all players enter the same thing):**
- Player 1: `1:2W5:6`
- Player 2: `1:2W5:6`
- Player 5: `1:2L5:6`
- Player 6: `1:2L5:6`

### Example 2b: 4-Player Team Game (Two Games, One Team Wins Both)

**Situation:** Team of Players 1&2 plays TWO games against Team of Players 5&6. Team 1&2 wins both.

**Entries (all players enter the same thing):**
- Player 1: `1:2WW5:6`
- Player 2: `1:2WW5:6`
- Player 5: `1:2LL5:6`
- Player 6: `1:2LL5:6`

**Note:** All teammates share the same result(s)! Both players on a team get identical results.

### Example 3: 4-Player Team Game (Draw)

**Situation:** Team of Players 3&4 plays against Team of Players 7&8. Teams draw.

**Entries (all players enter the same thing):**
- Player 3: `3:4D7:8`
- Player 4: `3:4D7:8`
- Player 7: `3:4D7:8`
- Player 8: `3:4D7:8`

**Note:** In a draw, all four players get Draw.

### Example 4: Correction Scenario

**Situation:** You entered `5W7` but realized you actually lost

**Steps:**
1. Click the cell containing `5W7`
2. Change to `5L7`
3. Click Save
4. Verify Player 7 has `7W5`

---

## Troubleshooting

### "Player X doesn't exist"

**Cause:** Referenced a rank that hasn't been added yet

**Fix:** Add the player via **Operations → Add Player**, then re-enter the game

### "Conflicting results"

**Cause:** Two players entered incompatible results for the same game

**Fix:** Check both players' entries and correct one of them

### Ratings seem wrong after recalculation

**Possible causes:**
1. Wrong W/L entered (most common)
2. Wrong opponent rank
3. Missing opponent entry

**Fix:** Use **Operations → Check Errors**, then review recent entries

---

**Version:** 1.0  
**Last Updated:** April 2026
