# Bughouse Chess Ladder - User Manual

## Getting Started

### Connecting to a Server
- **Auto-Detect:** Open the app at your club's subdomain; it connects automatically.
- **Manual:** **Operations → Settings**. Enter URL and API key, then **Save**.
- **One-Click URL:** `http://domain.com/?config=1&server=URL&key=KEY`
- **Local Mode:** Drag a `.tab`, `.xls`, or `.txt` file onto the splash screen.

---

## Entering Game Results

| Method | Best For | How to Use |
| :--- | :--- | :--- |
| **Direct Entry** | One game | Click cell → Enter result string (e.g., `5W7`) → **Save** |
| **Enter Games** | Systematic | **Operations → Enter Games** → Enter string → **Ctrl+E** (Save & Next) |
| **Error Correction** | Fixing errors | **Operations → Check Errors** → **Continue with corrections** → Submit |
| **Bulk Paste** | Spreadsheets | **Operations → Paste Multiple Results** → Paste whitespace-separated list |

**Keyboard Shortcuts:**
- `Ctrl+E`: Save, recalculate, and jump to next cell (Enter Games mode)
- `Ctrl+S`: Save current entry
- `Ctrl+C`: Cancel dialog (or Clear matching cells in Error mode)
- `Ctrl+O`: Toggle Override mode (skip validation)
- `Escape`: Close dialog

---

## Game Result Formats

### 2-Player Games
- **Single:** `A_R_B` (e.g., `2W3` = 2 beats 3)
- **Double:** `A_R1_R2_B` (e.g., `3WL4` = 3 vs 4, Win then Loss)

### 4-Player Team Games
- **Format:** `A:B_R_C:D` or `A:B_R1_R2_C:D`
- **Example:** `5:6W7:8` (Team 5&6 wins one game against 7&8)
- **Example:** `1:2LL3:4` (Team 1&2 loses both games against 3&4)

---

## Error Codes

| Code | Meaning | Fix |
| :--- | :--- | :--- |
| 1 | Invalid characters | Use digits, W, L, D, colons |
| 2 | Invalid 2-player format | Add opponent: `5W6` |
| 3 | Incomplete game entry | Complete format: `1:2W3:4` |
| 4 | Missing result code | Add W, L, or D |
| 5 | Too many results | Max 2 results per game: `5WW6` |
| 6 | Duplicate player | Player cannot play themselves |
| 7 | Missing player 4 | Complete 4-player format: `1:2W3:4` |
| 8 | Missing player | Ensure all players exist in ladder |
| 9 | Rank > 200 | Use valid rank |
| 10 | Conflicting results | Check all players' records |
| 11 | Player not found | Add player via **Operations → Add Player** |

---

## Tips & Troubleshooting

- **Header Colors:**
  - **Green:** Tournament active (results exist)
  - **Blue:** View-only (no valid API key)
  - **Dark Slate:** Normal editing mode
- **Sync Status:** Cells with an underscore (e.g., `4W5_`) are confirmed on the server.
- **Conflicts:** If you enter `5W6` but Player 6 entered `6W5`, one must be corrected.
- **Troubleshooting:** If ratings look wrong, run **Operations → Check Errors** immediately.



