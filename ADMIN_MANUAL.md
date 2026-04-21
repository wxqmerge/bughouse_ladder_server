# Bughouse Chess Ladder - Administrator Manual

**Version: 1.0.2**

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
- Add Player option visible in Operations menu
- Project name becomes editable in header

### When Admin Mode is Disabled

Admin mode is automatically disabled when connected to a server without an admin API key. This prevents unauthorized administrative changes on shared servers. See [SECURITY.md](./SECURITY.md) for access levels.

### Admin-Only Features

| Feature | Location | Purpose |
|---------|----------|--------|
| Load Data | File → Load | Import .tab/.xls files |
| Export Data | File → Export | Download current ladder |
| Sort Options | Sort menu | Reorder player display |
| Add Player | Operations → Add Player | Create new player entries |
| Edit Project Name | Header (click title) | Change ladder name |

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
2. File downloaded with format: `{ProjectName}_YYYY-MM-DD_HH-MM-SS.tab`
3. Contains all player data, game results, current ratings, version header

### Multi-Client Synchronization

In server mode, changes are synchronized automatically via 5-second polling with change detection. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full sync algorithm and diagrams.

---

## Player Management

### Adding Players

1. Go to **Operations → Add Player** (Admin mode required)
2. Fill in fields: Rank (auto-assigned), Group, Last Name, First Name, Rating, Grade, Phone, School, Room, Info
3. Click "Add Player"

**Auto-assignment:**
- Rank: max existing rank + 1
- Attendance: set to rank number
- Game Results: 31 empty slots
- New Rating: copied from rating field

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
3. **Calculates new ratings** — applies Elo formula, aggregates changes per player
4. **Updates statistics** — recalculates game counts, win/loss/draw records
5. **Saves to storage** — localStorage (local) or PUT request (server)

#### Error Handling

If errors are found:
1. Recalculation pauses before applying rating changes
2. Error dialog shows the first error with original string and message
3. Options: Submit Correction, Clear Cell, Cancel

### Elo Rating System

```
Expected Score = 1 / (1 + 10^((OpponentRating - YourRating) / 400))
New Rating = Old Rating + K × (Actual Score - Expected Score)
```

**K-Factor:** Default 32. Higher K = more volatile (beginners). Lower K = stable ratings (masters).

---

## New Day Processing

### What Changes

1. **Title Progression** — BG_Game → Bishop_Game → Pillar_Game → Kings_Cross → Pawn_Game → Queen_Game → (cycles)
2. **Rating Finalization** — "New Rating" moves to "Previous Rating", calculations start fresh
3. **Game Count Recalculation** — counted from game results array each new day
4. **Re-ranking Option** — players re-sorted by rating, ranks updated

### Procedure

1. Ensure all games entered and recalculated
2. Review new ratings
3. Process new day
4. Confirm changes — data saved automatically

---

## Backup System

The server maintains up to 20 automatic backups of `ladder.tab`, each created before a write operation. Backups are named with timestamps: `ladder_backup_YYYYMMDD_HHMMSS.tab`.

### Restoring from Backup (Two-Step)

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

---

**Version:** 1.0  
**Last Updated:** April 2026  
**Prerequisites:** User Manual knowledge assumed
