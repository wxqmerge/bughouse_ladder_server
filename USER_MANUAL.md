# Bughouse Chess Ladder - User Manual

## Getting Started

### Connecting to a Server
- **Auto-Detect:** Open the app at your club's subdomain; it connects automatically.
- **Manual:** **Operations → Settings**. Enter URL and API key, then **Save**.
- **One-Click URL:** http://domain.com/?config=1&server=URL&key=KEY
- **Local Mode:** Drag a .tab, .xls, or .txt file onto the splash screen.
- **Quick Test:** Use your own `?config=1&server=YOUR_SERVER&key=YOUR_KEY` URL

---

## Player Management

| Method | Best For | Workflow |
| :--- | :--- | :--- |
| **Bulk Import** | Large rosters | Export .tab $\rightarrow$ Edit in LibreOffice $\rightarrow$ Import |
| **Admin Mode** | Single/Quick edits | Use the empty bottom row or edit cells directly |
| **In-Flow** | During entry | Use the **"+ Add Player"** button in the Error Dialog |

---

## Entering Game Results

| Method | Best For | How to Use |
| :--- | :--- | :--- |
| **Direct Entry** | One game | Click cell → Enter result string (e.g., 5W7) → **Save** |
| **Enter Games** | Systematic | **Operations → Enter Games** → Enter string → **Ctrl+E** (Save & Next) |
| **Error Correction** | Fixing errors | **Operations → Check Errors** → **Continue with corrections** → Submit |
| **Bulk Paste** | Spreadsheets | **Operations → Paste Multiple Results** → Paste whitespace-separated list |

**Pro Tip (In-Flow Addition):** If you enter a result for a non-existent player (e.g., 5W16), click **"+ Add Player (Rank 16)"** in the error dialog to add them instantly without leaving the entry flow.

**Mini-game Access:** Click the ladder name in the header to switch between mini-games (e.g., BG_Game, Pawn_Game, Queen_Game).

**Keyboard Shortcuts:**
- Ctrl+E: Save, recalculate, and jump to next cell (Enter Games mode)
- Ctrl+S: Save current entry
- Ctrl+C: Cancel dialog (or Clear matching cells in Error mode)
- Ctrl+O: Toggle Override mode (skip validation)
- Escape: Close dialog

---

## Game Result Formats

### 2-Player Games
- **Single:** A_R_B (e.g., 2W3 = 2 beats 3)
- **Double:** A_R1_R2_B (e.g., 3WL4 = 3 vs 4, Win then Loss)

### 4-Player Team Games
- **Format:** A:B_R_C:D or A:B_R1_R2_C:D
- **Example:** 5:6W7:8 (Team 5&6 wins one game against 7&8)
- **Example:** 1:2LL3:4 (Team 1&2 loses both games against 3&4)

---

## Error Codes

| Code | Meaning | Fix |
| :--- | :--- | :--- |
| 1 | Invalid characters | Use digits, W, L, D, colons |
| 2 | Invalid 2-player format | Add opponent: 5W6 |
| 3 | Incomplete game entry | Complete format: 1:2W3:4 |
| 4 | Missing result code | Add W, L, or D |
| 5 | Too many results | Max 2 results per game: 5WW6 |
| 6 | Duplicate player | Player cannot play themselves |
| 7 | Missing player 4 | Complete 4-player format: 1:2W3:4 |
| 8 | Missing player | Ensure all players exist in ladder |
| 9 | Rank > 200 | Use valid rank |
| 10 | Conflicting results | Check all players' records |
| 11 | Player not found | Add player via **Operations → Add Player** |

---

## Tournament & System Management

- **Switching Mini-games:** Click the ladder name in the header to select BG_Game, Pawn_Game, or Queen_Game.
- **Generating Trophies:** **Operations → Settings → Generate Trophies**.
- **Clearing Data:**
  - **Mini-games:** **Operations → Settings → Clear Mini-Game Data** (removes all mini-games at once).
  - **Test Cleanup:** **Operations → Settings → Admin Mode → Walkthrough Reports → Ctrl+C** (until blank).

---

## Print Labels

Access via **Operations → Print Labels**. Opens a configuration dialog for printing name labels.

### Print Labels Dialog

| Setting | Description |
| :--- | :--- |
| **Labels Per Page** | 20/page (2×10) or 30/page (3×10) |
| **Fields** | Toggle which data fields appear on each label (Ladder Name, Group, Rating, Rank, Grade, First Name, Last Name, School/Room) |
| **Copies** | Number of full sets to print (1–20) |
| **Fill with Blanks** | Check to add blank numbered labels up to a max count (fills last page) |
| **Layout Editor** | Opens the label layout editor for field positioning |

### Layout Editor

Opens from the **Layout Editor** button in the Print Labels dialog.

| Section | Controls |
| :--- | :--- |
| **Presets** | Left panel — create, rename, duplicate, delete saved layouts. Export/Import JSON for sharing. |
| **Margins** | Top/Bottom margin (% of cell height), Column Offset per column (-5% to +5%). Column offset shifts all fields in that column left/right. |
| **Fields** | X% (horizontal), Y% (vertical), Size (pt) for each field. Per-field reset button restores CSS default. |
| **Preview** | Live preview showing a single label cell with correct aspect ratio (240px for 20/page, 160px for 30/page). |

**Saving:** Click **Save Layout** to store the layout. It becomes available as a preset for future use. Saved layouts sync to the server (SERVER mode) and persist in localStorage (LOCAL mode).

**Defaults:** All margins and offsets default to 0 — no position change from standard CSS layout.

---

## Round Robin View

Access via **View → Round Robin**. Replaces the standard game-results columns with a matchup grid showing each player's Win/Loss record against every other player.

### How It Works

- **Toggle:** Check/uncheck **Round Robin** in the View menu.
- **Player Cap:** Activates only when there are **31 or fewer visible players**. If more than 31 players are visible, the toggle remains unchecked and the view stays in standard mode.
- **1v1 Only:** Only 2-player games (single or double result) are displayed. 4-player team games (containing `:`) are ignored.
- **Hidden Players:** Players filtered by "Hide Hidden Players" are excluded from both rows and columns. The 31-player cap counts only visible players.

### Reading the Grid

| Cell Value | Meaning |
| :--- | :--- |
| **W** | Row player won (single game) |
| **L** | Row player lost (single game) |
| **D** | Draw |
| **W/L** or **L/W** | Two-game match result (first result is game 1, second is game 2) |
| *(blank)* | No game played between these two players |

Each row represents a player. Each column represents their opponent (in rank order). The diagonal (player vs self) is hidden.

### Example

If Player 5 has `12W5` in their record, the cell at row 5, column corresponding to Player 12's rank will show **W**. Player 12's row will show **L** at the column for Player 5.

If Player 10 has `10WL11`, the grid shows **W/L** at row 10 vs column 11, and **L/W** at row 11 vs column 10.

---

## Tips & Troubleshooting

- **Header Colors:**
  - **Green:** Tournament active (results exist)
  - **Blue:** View-only (no valid API key)
  - **Dark Slate:** Normal editing mode
- **Sync Status:** Cells with an underscore (e.g., 4W5_) are confirmed on the server.
- **Conflicts:** If you enter 5W6 but Player 6 entered 6W5, one must be corrected.
- **Troubleshooting:** If ratings look wrong, run **Operations → Check Errors** immediately.
