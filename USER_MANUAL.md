# Bughouse Chess Ladder - User Manual

**Version: 1.1.6**

## Getting Started

### Connecting to a Server

#### Option 1: Settings Dialog
1. Open **Operations → Settings**
2. Enter server URL and API key
3. Click **Save**

#### Option 2: One-Click URL
Open this URL to auto-configure:
```
http://your-domain.com/?config=1&server=http://your-server:port&key=your-api-key-here
```

#### Option 3: Load Local File
Drag a `.tab`, `.xls`, or `.txt` file onto the splash screen (no server needed).

### API Key Access

| Key Status | What You Can Do |
|-----------|-----------------|
| No key / wrong key | View data only (read-only) |
| Valid user key | Enter games and save results |
| Admin key | Full access including admin features |

See [SECURITY.md](./SECURITY.md) for key generation details.

---

## Table of Contents

1. [Entering Game Results](#entering-game-results)
2. [Game Result Formats](#game-result-formats)
3. [Error Checking and Correction](#error-checking-and-correction)
4. [Bulk Operations](#bulk-operations)
5. [Tips and Best Practices](#tips-and-best-practices)

---

## Entering Game Results

### Method 1: Direct Cell Entry

Best for entering one game result at a time.

1. Click on the cell (row = player rank, column = round)
2. Enter the result string in the dialog
3. Click "Save"

**Example:** Player 5 played against 6, 7, and 8 in round 1:
- Click row 5, column 1 → Enter: `5:6W7:8` → Save

### Method 2: Enter Games Mode

Best for systematically entering all games round by round.

1. Go to **Operations → Enter Games**
2. Dialog shows the first empty cell
3. Enter the result string
4. Click "Enter_Recalculate_Save" to save, recalculate ratings, and jump to next cell
5. Repeat until all games entered

**Keyboard shortcuts:**
- `Enter` or `Ctrl+S`: Save and move to next cell
- `Escape` or `Ctrl+X`: Cancel and exit

### Method 3: Error Correction Entry

Best for fixing invalid or conflicting results detected by Check Errors.

1. Click "Continue with corrections" button
2. Dialog shows original string, error message, affected round/player
3. Enter corrected result → click "Submit Correction"
4. Automatically moves to next error (if any)

### Method 4: Bulk Paste

Best for entering many results quickly from a spreadsheet or text file.

1. Prepare results in whitespace-separated format (spaces, tabs, or newlines):
   ```
   1:2W3:4	5:6L7:8	9:10D11:12
   ```
2. Copy to clipboard
3. Go to **Operations → Paste Multiple Results** (or paste directly into any cell)
4. System applies results sequentially to empty cells

---

## Game Result Formats

### Overview

Game results use a compact notation encoding player ranks and outcomes.

**Important:** 4-player games are TEAM games — two teams of two play against each other. All teammates share the same results.

### 2-Player Games

#### Single Result
```
Format: A_R_B
Meaning: Player A plays Player B, result _ applies to Player A

Examples:
  2W3  → Player 2 BEATS Player 3
  5L7  → Player 5 LOSES to Player 7
  3D8  → Player 3 DRAWS with Player 8
```

#### Double Result (Two Games)
```
Format: A_R1_R2_B
Meaning: Player A plays Player B twice

Examples:
  3WL4  → Player 3 vs 4: Win then Loss (split)
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

Examples:
  5:6W7:8  → Team of 5&6 plays ONE game vs 7&8, Team 5&6 WINS
  1:2LL3:4 → Team of 1&2 plays TWO games vs 3&4, Team 1&2 LOSES both
  5:6WD7:8 → Team of 5&6 plays TWO games vs 7&8, wins first, draws second
  9:10D11:12 → Teams draw (one game), all four players get Draw
```

**Important:** Teammates always share the same result(s). If you enter `1:2LL3:4`, both players 1 and 2 get two Losses.

### Result Codes

| Code | Meaning |
|------|--------|
| `W` | Win |
| `L` | Loss |
| `D` | Draw |

---

## Error Checking and Correction

### Automatic Error Detection

Errors are checked when you:
- Click **Operations → Recalculate_Save**
- Enter games in Enter Games mode
- Import data from a file

### Manual Error Check

1. Go to **Operations → Check Errors**
2. Review the error report
3. Click "Continue with corrections" to fix errors

### Types of Checks

1. **Format Validation** — Is the result string properly formatted?
2. **Player Existence** — Do all referenced player ranks exist?
3. **Result Consistency** — Do paired players have matching results?
4. **Logical Validity** — Are results logically consistent?

### Error Code Reference

| Error | Meaning | Fix |
|-------|---------|-----|
| 1 | Invalid characters | Use only digits, W, L, D, colons |
| 2 | Incomplete 2-player game | Add opponent: `5W6` |
| 3 | Incomplete 4-player game | Complete format: `1:2W3:4` |
| 4 | Missing result code | Add result code: `1:2W3:4` |
| 5 | Too many results | Max 2 results per game: `5WW6` |
| 6 | Duplicate player in game | Player can't play themselves |
| 7 | Missing player 4 | Complete format: `1:2W3:4` |
| 9 | Player rank exceeds 200 | Use valid rank within range |
| 10 | Conflicting results | Check all players' records |

### Common Scenarios

**Opponent entered wrong result:** If you entered `5W6` but Player 6 entered `6W5`, one entry must be corrected. If you won: keep `5W6`, change Player 6 to `6L5`.

**Wrong player rank:** Entered `15W6` but only 10 players exist. Change to valid rank or add the player via **Operations → Add Player**.

**Incomplete 4-player entry:** Entered `1:2W3` (missing last player). Complete as `1:2W3:4`.

---

## Bulk Operations

### Paste Multiple Results

Format results as whitespace-separated values:
```
1:2W3:4 5:6W7:8 9:10W11:12
```
Or on separate lines. Go to **Operations → Paste Multiple Results** and click "Paste."

### Enter Games Mode (Full Walkthrough)

Click **Operations → Enter Games**, enter results, click "Enter_Recalculate_Save" — automatically jumps to next empty cell. Press Escape when done.

---

## Tips and Best Practices

1. **Read the ErrorDialog feedback** — After entering a result, the dialog shows player names and parsed result. Verify it matches your intent.

2. **Team games: all teammates share results** — If you enter `1:2LL3:4`, both players 1 and 2 get two Losses.

3. **Use Enter Games mode for batches** — More efficient than cell-by-cell entry.

4. **Save frequently** — Changes are auto-saved locally, but recalculation saves to server and enables multi-client sync.

5. **Check errors after each round** — Catch mistakes early before they compound.

6. **Multi-client: wait for underscore** — Cells show "_" suffix when saved to server (e.g., "4W5_"). This confirms the entry is synced.

### Common Mistakes

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| Entering `5W6` when you lost | Ratings wrong by double | Double-check W/L before saving |
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
| `Ctrl+N` | Next error (correction mode) |
| `Ctrl+P` | Previous error (correction mode) |
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

### 2-Player Format
```
You Win:     YourRank W OpponentRank    Example: 5W7
You Lose:    YourRank L OpponentRank    Example: 5L7
You Draw:    YourRank D OpponentRank    Example: 5D7

Two Games:
Split:       YourRank WL OpponentRank   Example: 5WL7
Win Both:    YourRank WW OpponentRank   Example: 5WW7
Lose Both:   YourRank LL OpponentRank   Example: 5LL7
```

### 4-Player Format
```
Format: P1:P2_Result_P3:P4 or P1:P2_R1_R2_P3:P4

You are Player 5, partner is 6:
  One game, your team wins:   5:6W7:8
  Two games, your team loses both: 5:6LL7:8
  Two games, split result:    5:6WL7:8
  One game, teams draw:       5:6D7:8
```

---

## Examples by Scenario

### Example 1: Simple 2-Player Game
**Situation:** Player 3 beats Player 7
- Entry for Player 3: `3W7`
- Entry for Player 7: `7L3`

### Example 2: 4-Player Team Game (Your Team Wins)
**Situation:** Team 1&2 plays ONE game against Team 5&6. Team 1&2 wins.
- Player 1: `1:2W5:6`
- Player 2: `1:2W5:6`
- Player 5: `1:2L5:6`
- Player 6: `1:2L5:6`

### Example 3: 4-Player Team Game (Draw)
**Situation:** Team 3&4 plays against Team 7&8. Teams draw.
- All four players enter: `3:4D7:8`

### Example 4: Correction
**Situation:** You entered `5W7` but realized you actually lost
1. Click the cell containing `5W7`
2. Change to `5L7`
3. Click Save
4. Verify Player 7 has `7W5`

---

## Troubleshooting

### "Player X doesn't exist"
Referenced a rank that hasn't been added yet. Add the player via **Operations → Add Player**, then re-enter the game.

### "Conflicting results"
Two players entered incompatible results for the same game. Check both entries and correct one.

### Ratings seem wrong after recalculation
1. Wrong W/L entered (most common)
2. Wrong opponent rank
3. Missing opponent entry

Fix: Use **Operations → Check Errors**, then review recent entries.

---

**Version:** 1.1.0  
**Last Updated:** April 2026
