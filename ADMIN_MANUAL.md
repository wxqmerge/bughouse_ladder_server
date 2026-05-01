# Bughouse Chess Ladder - Administrator Manual

**Version: 1.1.6**

## Table of Contents

1. [Introduction](#introduction)
2. [Admin Mode](#admin-mode)
3. [Server Configuration](#server-configuration)
4. [Data Management](#data-management)
5. [Player Management](#player-management)
6. [Rating Calculation](#rating-calculation)
7. [New Day Processing](#new-day-processing)
8. [Backup System](#backup-system)
9. [Troubleshooting](#troubleshooting)
10. [Appendix A: Rating Algorithm Details](#appendix-a-rating-algorithm-details)
11. [Appendix B: Settings Dialog Reference](#appendix-b-settings-dialog-reference)

---

## Introduction

This manual covers administrative functions for managing the Bughouse Chess Ladder system. It assumes familiarity with the [User Manual](./USER_MANUAL.md)'s game entry and error correction procedures.

**Access levels and API keys are documented in [SECURITY.md](./SECURITY.md).**

---

## Admin Mode

### Enabling Admin Mode

Admin mode is toggled via **Operations → Admin Mode** (or **Exit Admin Mode** when active).

**Visual indicators of admin mode:**
- File menu appears (Load, Export)
- Sort menu appears (5 sorting options)
- Add Player, Delete Hidden Players options visible in Operations menu
- Project name becomes editable in header
- Trophy column (T) appears between nRating and grade

### When Admin Mode is Disabled

Admin mode is automatically disabled when connected to a server without an admin API key. This prevents unauthorized administrative changes on shared servers. See [SECURITY.md](./SECURITY.md) for access levels.

### Admin-Only Features

| Feature | Location | Purpose |
|---------|----------|--------|
| Load Data | File → Load | Import .tab/.xls files |
| Export Data | File → Export | Download current ladder |
| Title Menu | File → (dropdown) | Switch title among 8 options |
| Sort Options | Sort menu | Reorder player display |
| Add Player | Operations → Add Player | Create new player entries |
| Delete Hidden Players | Operations → Delete Hidden Players | Review and delete hidden (or all) players |
| Restore Backup | Operations → Restore Backup | Browse/restore/delete server backups |
| Edit Project Name | Header (click title) | Change ladder name |

### Admin Lock

When multiple clients connect to the same server, only one can hold admin mode at a time. If another client already has admin mode, you'll see an override dialog with a 30-second countdown timer. You can force-acquire the lock when the timer expires.

---

## Server Configuration

### Settings Dialog

Access: **Operations → Settings** (always available, even without admin mode).

1. Enter server URL (e.g., `http://localhost:3000` or `https://ladder.example.com`)
2. Optionally enter API key
3. Click **Save** — page reloads with new configuration

### Connection Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Local** | Browser localStorage only | Testing, offline use |
| **Server** | Connects to production server | Shared data access |

### Quick Setup via URL

Share a single URL to auto-configure any client:

```
http://your-domain.com/?config=1&server=http://your-server:port&key=your-api-key-here
```

---

## Data Management

### Loading Data Files

**Supported formats:** `.tab`, `.xls` (VB6 Excel files in .tab format), `.txt`

#### Loading Procedure

1. Ensure Admin Mode is enabled
2. Go to **File → Load** (or drag & drop .tab/.xls/.txt file)
3. Select file
4. In server mode, a confirmation dialog shows:
   - Filename, player count, rounds filled, estimated games played
5. Click **Accept & Save to Server** to push data, or **Decline** to restore from server

#### Post-Load Actions

After loading, the system parses player data, validates result strings, calculates initial ratings if new ratings not provided, and displays any format errors.

### Exporting Data

1. Go to **File → Export**
2. File downloaded with format: `{FirstWordOfProjectName}_timestamp.tab` (e.g., `BG_Game_2026-04-20T14-30-22-123Z.tab`)
3. Contains all player data, game results, current ratings, version header

### Multi-Client Synchronization

In server mode, changes are synchronized automatically via 5-second polling with change detection. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full sync algorithm and diagrams.

---

## Player Management

### Adding Players (Dialog)

1. Go to **Operations → Add Player** (Admin mode required)
2. Fill in fields: Rank (auto-assigned), Group, Last Name, First Name, Rating, Grade, Phone, School, Room, Info
3. Click "Add Player"

### Adding Players (Inline Row)

When admin mode is enabled, an editable empty row appears at the bottom of the player table. You can type player data directly into the cells:

1. Click into any editable cell in the bottom row
2. Fill in fields — **Enter** or **Tab** moves to the next column, **Shift+Tab** moves backward
3. **Ctrl+Enter** creates the player immediately (requires First Name + Last Name filled)
4. When both **First Name** and **Last Name** are filled, the player is automatically created and the row resets
5. Press **Escape** to clear focus without creating

**Keyboard navigation:**
- **Enter** — move to next column
- **Tab** — move to next column
- **Shift+Tab** — move to previous column
- **Ctrl+Enter** — create player from current row data
- **Escape** — cancel focus

**Auto-assignment (both methods):**
- Rank: max existing rank + 1 (read-only in inline row)
- Attendance: set to rank number
- Game Results: 31 empty slots
- New Rating: starts at 0 (calculated on first Recalculate_Save)

### Bulk Pasting Players

You can paste multiple players from a spreadsheet (Excel, Google Sheets) into the inline empty row:

1. Copy player rows from your spreadsheet (tab-separated columns)
2. Click into the starting column of the inline row that matches your data layout
3. Press **Ctrl+V** to paste
4. Each complete row (with both First Name and Last Name) is created as a player
5. If the last row is incomplete, it stays in the inline row for continued typing
6. A toast notification shows how many players were added

**Dynamic field mapping:** The starting column determines what each pasted column represents:
- Paste into **Group** column → maps: Group | LastName | FirstName | Rating | ...
- Paste into **LastName** column → maps: LastName | FirstName | Rating | ...
- Paste into **FirstName** column → maps: FirstName | Rating | nRating | ...

**Auto-fill:** When pasting, empty values for Group, School, Room, and Grade are copied from the previous player in the list. This is useful when pasting a roster where most fields are identical.

**Trophy column:** The Trophy cell (T) shows "+" or "−" and can be edited by typing directly. Use "−" to set `trophyEligible: false`, anything else for `true`.

### Editing Existing Players (Main Table)

In admin mode, all cells in the main player table are editable. Keyboard navigation works like a spreadsheet:

- **Enter** — moves to the next cell down (same column, next player row). Special case: from FirstName, moves to LastName of the next player.
- **Tab** — moves to the next cell right (same row, next column)
- **Shift+Tab** — moves to the previous cell left (same row, previous column)
- **Escape** — blurs the cell without saving

**Multi-row paste:** You can paste multiple rows of data into any cell. Values fill cells sequentially, wrapping to the next player row when reaching the end of the current row.

**Trophy column:** Click to focus the cell, then type "+" or "−". Enter/Tab saves the value. The value is normalized on save: any input containing "−" sets `trophyEligible: false`, otherwise `true`.

### Hiding Players

Players whose **Group** field ends with "x" (case-insensitive) are hidden in user/view modes but remain visible in admin mode. This allows administrators to mark players as inactive without deleting them.

**Example:** A player with Group "A1x" is visible in admin mode but hidden when viewing the ladder as a non-admin user.

### Deleting Players

#### Hidden Players

1. Go to **Operations → Delete Hidden Players** (Admin mode required)
2. A dialog shows the first hidden player (group ends with "x") with their full details and game results
3. Click **Delete** to remove the player, or **Skip** to keep them and review the next hidden player
4. The dialog cycles through all hidden players one at a time
5. When all hidden players have been reviewed, the remaining players are saved

#### Any Player (when no hidden players exist)

If there are no hidden players (no groups ending with "x"), the same menu opens the dialog with all players listed. You can review and delete any player using the same Delete/Skip workflow.

### Sorting Players

Access: Sort menu (Admin mode required)

| Option | Description | Use Case |
|--------|-------------|----------|
| By Rank | Numerical order (1, 2, 3...) | Default view |
| By Last Name | Alphabetical by surname | Finding specific players |
| By First Name | Alphabetical by given name | Alternative lookup |
| By New Rating | Highest to lowest | Current standings |
| By Previous Rating | Highest to lowest old rating | Comparing changes |

**Note:** Sorting is display-only — does not change actual rank assignments.

### Sorting Players

Access: Sort menu (Admin mode required)

| Option | Description | Use Case |
|--------|-------------|----------|
| By Rank | Numerical order (1, 2, 3...) | Default view |
| By Last Name | Alphabetical by surname | Finding specific players |
| By First Name | Alphabetical by given name | Alternative lookup |
| By New Rating | Highest to lowest | Current standings |
| By Previous Rating | Highest to lowest old rating | Comparing changes |

**Note:** Sorting is display-only — does not change actual rank assignments.

---

## Rating Calculation

### Recalculate_Save

Access: **Operations → Recalculate_Save**

#### What It Does

1. **Validates all game results** — checks format, verifies player existence, detects conflicts
2. **Processes game results** — parses strings, builds match database, identifies pairings
3. **Calculates new ratings** — applies hybrid Elo/blending formula (see [Appendix A](#appendix-a-rating-algorithm-details))
4. **Updates statistics** — recalculates game counts, win/loss/draw records
5. **Saves to storage** — localStorage (local) or PUT request (server)

#### Error Handling

If errors are found:
1. Recalculation pauses before applying rating changes
2. Error dialog shows the first error with original string and message
3. Options: Submit Correction, Clear Cell, Cancel

#### K-Factor

Configurable in **Operations → Settings**. Default: **20** (range 1–100). Higher K = more volatile ratings. Lower K = more stable.

#### Trophy Normalization

During Recalculate_Save, the Trophy field (trophyEligible) is normalized:
- Any value containing "−" (dash) → `trophyEligible: false`
- Any other value → `trophyEligible: true`

This ensures consistency even if the field contains mixed or malformed entries like "+-" or "-+".

---

## New Day Processing

### What Changes

1. **Title Progression** — BG_Game → Bishop_Game → Pillar_Game → Kings_Cross → Pawn_Game → Queen_Game → (cycles)
2. **Rating Finalization** — "New Rating" moves to "Previous Rating", nRating resets to 0, calculations start fresh
3. **Game Results Cleared** — all game result cells are cleared
4. **Attendance Tracking** — reset to 0 if player had games; incremented by 1 if absent
5. **Re-ranking Option** — players re-sorted by rating, ranks updated

### Procedure

1. Ensure all games entered and recalculated
2. Review new ratings
3. Process new day
4. Confirm changes — data saved automatically

---

## Backup System

The server maintains up to 20 automatic backups of `ladder.tab`, each created before a write operation. Backups are named with timestamps: `ladder_backup_YYYYMMDD_HHMMSS.tab`.

### Restoring from Backup (UI)

1. Go to **Operations → Restore Backup** (admin mode required)
2. A dialog shows all available backups with timestamps and game result previews
3. Click **Restore** to apply, or **Delete** to remove a specific backup
4. In admin mode, a confirmation preview appears before applying

### Restoring from Backup (API)

1. **List backups:** Send `GET /api/admin/backups` — returns all backups with version numbers and timestamps
2. **Restore:** Send `POST /api/admin/backups/restore/ladder_backup_20250420_143022.tab`

### Deleting a Backup

Send `DELETE /api/admin/backups/ladder_backup_20250420_143022.tab`

### Automatic Rotation

When more than 20 backups exist, the oldest are automatically deleted.

### Server Statistics

Access: `GET /api/admin/stats` — returns total players, total games, last modified timestamp.

---

## Troubleshooting

### Data Not Syncing to Server

**Symptoms:** Changes visible locally but not on other clients

1. Check browser console for errors
2. Verify server URL is correct
3. Check network tab for failed PUT requests
4. Reload browser

### Rating Calculation Seems Wrong

1. Run Check Errors first
2. Review recent game entries
3. Verify opponent entries match

### Players Missing After Load

1. Check file format
2. Look for parse errors in console
3. Verify column alignment

### Server Logs

```bash
# Application logs (systemd)
sudo journalctl -u bughouse-ladder -f

# Direct server output
cd /var/www/bughouse-ladder/server && NODE_ENV=production node dist/index.js
```

### Server Down Mode

When the configured server becomes unreachable, a ⚠️ SERVER DOWN badge appears in the header. Admin mode remains available in this mode, and local changes are tracked for later sync when the server returns.

---

## Appendix A: Rating Algorithm Details

The rating system uses a **two-phase hybrid algorithm** that blends performance-based and Elo-based calculations depending on player experience.

### Phase 1: Expected Score

For every match, the expected score for side 0 is computed using a logistic formula:

```
Expected = 1 / (1 + 10^((OpponentSideRating - YourSideRating) / 400))
```

For 2-player games, each player's side rating is their own rating. For 4-player games, each side's rating is the average of the two teammates' ratings.

### Phase 2: Win/Loss/Draw Performance

Each game result contributes ±0.5 to a performance accumulator:
- Win (score=3): side 0 gets +0.5, side 1 gets -0.5
- Loss (score=1): side 0 gets -0.5, side 1 gets +0.5
- For 4-player games, both game results are accumulated

### Phase 3: Rating Update (Two Formulas)

**Players with ≤ 9 games — Blending Formula:**

```
PerfRating = max(0, PlayerRating × BlendingFactor + PerfMultiplier × WLD_Perfs)
New nRating = abs((Old_nRating × Games_Played × BlendingFactor + PerfRating) / (Games_Played + 1))
```

- BlendingFactor: default **0.99** (configurable via settings)
- PerfMultiplier: **400** for 2-player, **200** per result for 4-player

**Players with ≥ 10 games — Elo Formula:**

```
Elo_Perf = WLD_Perfs + ExpectedMult × (0.5 - Expected)
New nRating = abs(Old_nRating + Elo_Perf × K_Factor)
```

- ExpectedMult: **1** for 2-player, **2** for 4-player
- K_Factor: default **20** (configurable in Settings, range 1–100)

### Double-Pass Calculation

Ratings are calculated in **two passes** over all matches. The first pass updates working ratings, and the second pass re-applies calculations using the intermediate results. This produces smoother convergence for players with multiple games on the same day.

### 4-Player vs 2-Player Differences

| Aspect | 2-Player | 4-Player |
|--------|----------|----------|
| Side rating | Individual | Average of 2 teammates |
| PerfMultiplier | 400 | 200 per result |
| ExpectedMult | 1 | 2 |
| Results per match | 1 | 2 |

### Key Parameters (Configurable in Settings)

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| K-Factor | 20 | 1–100 | Elo volatility (games ≥ 10) |
| Blending Factor | 0.99 | — | Weight on previous rating (games ≤ 9) |
| Perf Multiplier Scale | 1 | — | Scales 2-player perf multiplier (400 × scale) |

---

## Appendix B: Settings Dialog Reference

Access: **Operations → Settings**

### Configuration Panel (Admin Mode Only)

| Setting | Description |
|---------|-------------|
| Show Ratings | Toggle visibility of rating columns (A1-A8, I1-I8, Z1-Z8 groups) |
| Debug Level | 0 = all logs, 5 = default, 10+ = critical |
| K-Factor | Elo volatility: 1–100 (default 20) |

### Actions Panel (Admin Mode Only)

These buttons only appear when admin mode is enabled.

| Button | Action |
|--------|--------|
| New Day | Finalize ratings, advance title, clear game results, reset attendance |
| New Day + Re-rank | Same as New Day, plus re-sort players by rating and update ranks |
| Walk Through Reports | Step through report dialog |
| Clear All | Clear all player data from grid |
| Set Sample Data | Reset to sample dataset (with confirmation) |

### Server Connection Panel

| Field | Description |
|-------|-------------|
| Server URL | API server address (leave empty for local mode) |
| API Key | Required if server has admin protection enabled |
| Debug Mode | Checkbox: show extra info in dialogs |
| Restore Last Server Config | One-click restore of last working server + key |

---

**Version:** 1.1.0  
**Last Updated:** April 2026  
**Prerequisites:** User Manual knowledge assumed
