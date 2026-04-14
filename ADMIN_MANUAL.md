# Bughouse Chess Ladder - Administrator Manual

## Table of Contents

1. [Introduction](#introduction)
2. [Admin Mode Overview](#admin-mode-overview)
3. [Server Configuration](#server-configuration)
4. [Data Management](#data-management)
5. [Player Management](#player-management)
6. [Rating Calculation Deep Dive](#rating-calculation-deep-dive)
7. [Advanced Features](#advanced-features)
8. [Troubleshooting and Maintenance](#troubleshooting-and-maintenance)

---

## Introduction

This manual covers administrative functions for managing the Bughouse Chess Ladder system. It assumes familiarity with the User Manual's game entry and error correction procedures.

### Admin Access Levels

| Mode | Description | Capabilities |
|------|-------------|--------------|
| **Local** | No server configured | Full admin access |
| **Server (No API Key)** | Connected without admin key | Read-only, game entry only |
| **Server (With API Key)** | Connected with admin API key | Full admin access |

---

## Admin Mode Overview

### Enabling Admin Mode

Admin mode is toggled via **Operations → Admin Mode** (or **Exit Admin Mode** when active).

**Visual indicators of admin mode:**
- File menu appears (Load, Export)
- Sort menu appears (5 sorting options)
- Add Player option visible in Operations menu
- Project name becomes editable in header

### When Admin Mode is Disabled

Admin mode is automatically disabled when:
- Connected to a server without an admin API key configured
- This prevents unauthorized administrative changes on shared servers

### Admin-Only Features

| Feature | Location | Purpose |
|---------|----------|--------|
| Load Data | File → Load | Import .tab files |
| Export Data | File → Export | Download current ladder |
| Sort Options | Sort menu | Reorder player display |
| Add Player | Operations → Add Player | Create new player entries |
| Edit Project Name | Header (click title) | Change ladder name |

---

## Server Configuration

### Settings Dialog Access

Accessed via **Operations → Settings** (always available, even without admin mode).

### Connection Modes

#### Local Mode
- **Description:** All data stored in browser localStorage
- **Use case:** Development, offline use, testing
- **Limitations:** Data not shared, cannot write to local files

#### Development Mode
- **Description:** Connects to localhost server (typically port 3000)
- **Use case:** Testing server integration
- **Server URL:** `http://localhost:3000`

#### Server Mode
- **Description:** Connects to production server
- **Use case:** Production use with shared data
- **Server URL:** Configured per installation

### Server URL Configuration

1. Open Settings dialog
2. Enter server URL (e.g., `http://localhost:3000` or `https://ladder.example.com`)
3. Click "Test Connection"
4. If successful, click "Connect"
5. Browser reloads with new configuration

### Admin API Key Configuration

**Required for:** Full admin access on shared servers

1. Obtain API key from server administrator
2. Enter in Settings → Admin API Key field
3. Save settings
4. Toggle Admin Mode to enable admin features

**Security note:** The API key is stored in browser localStorage and sent with admin API requests.

### Connection Status Indicators

| Indicator | Meaning |
|-----------|--------|
| Green checkmark | Connected successfully |
| Red X | Connection failed |
| Yellow warning | Server down, working offline |
| Gray icon | Local mode (no server) |

---

## Data Management

### Loading Data Files

**Format:** Tab-delimited text file (.tab)

#### Supported Formats

1. **LadderForm Format (Recommended)**
    ```
    Rnk|Group|Last Name|First Name|Previous Rating|New Rating|Gr|Gms|Attendance|Phone|Info|1|2|3|...|31
    ```

2. **VB6 Ladder Format (Legacy)**
    - Automatically detected and converted
    - May lose some metadata

#### Loading Procedure

1. Ensure Admin Mode is enabled
2. Go to **File → Load**
3. Select .tab file
4. Preview shows:
   - Detected format
   - Number of players
   - Number of rounds with data
5. Click "Load" to import

#### Post-Load Actions

After loading, the system:
- Parses all player data
- Validates result strings
- Calculates initial ratings if new ratings not provided
- Displays any format errors

### Exporting Data

**Purpose:** Backup or transfer ladder data

1. Go to **File → Export**
2. File downloaded with format: `{ProjectName}_YYYY-MM-DD_HH-MM-SS.tab`
3. Contains:
   - All player data
   - All game results
   - Current ratings
   - Version header

### Data Synchronization

In server mode, changes are synchronized automatically:

1. **Client-side:** Changes stored immediately in localStorage
2. **Background sync:** PUT request sent to server (~15 second interval)
3. **Server:** Writes to `data/ladder.tab`
4. **Other clients:** Poll for changes (~15 second interval)

**Manual sync trigger:** Reload browser or toggle off/on server connection

---

## Player Management

### Adding Players

#### Via Add Player Dialog

1. Go to **Operations → Add Player** (Admin mode required)
2. Fill in fields:
   - **Rank:** Auto-assigned (next available number)
   - **Group:** e.g., "A1", "B" (optional)
   - **Last Name:** Required
   - **First Name:** Required
   - **Rating:** Starting rating (default: 0)
   - **Grade:** e.g., "8th" (optional)
   - **Phone:** Contact information (optional)
   - **School:** School name (optional)
   - **Room:** Room number (optional)
   - **Info:** Additional notes (optional)
3. Click "Add Player"

#### Auto-Assignment Behavior

- **Rank:** Automatically assigned as (max existing rank + 1)
- **Attendance:** Set to rank number
- **Game Results:** Initialized to 31 empty slots
- **New Rating:** Copied from rating field

### Sorting Players

**Access:** Sort menu (Admin mode required)

#### Sort Options

| Option | Description | Use Case |
|--------|-------------|----------|
| By Rank | Numerical order (1, 2, 3...) | Default organizational view |
| By Last Name | Alphabetical by surname | Finding specific players |
| By First Name | Alphabetical by given name | Alternative player lookup |
| By New Rating | Highest to lowest rating | Viewing current standings |
| By Previous Rating | Highest to lowest old rating | Comparing rating changes |

#### Sort Behavior

- Sorting is **display-only** - does not change actual rank assignments
- Player ranks remain fixed regardless of sort order
- Game results reference players by rank, not display position

### Bulk Player Operations

Currently, bulk player edits must be done via:
1. Export data
2. Edit in a spreadsheet application (e.g., LibreOffice Calc)
3. Re-import

---

## Rating Calculation Deep Dive

### Elo Rating System

The system uses the standard Elo rating formula:

```
Expected Score = 1 / (1 + 10^((OpponentRating - YourRating) / 400))

New Rating = Old Rating + K × (Actual Score - Expected Score)
```

#### K-Factor

The K-factor determines rating volatility:
- **Default:** 32 (standard tournament rating)
- **Higher K:** More volatile ratings (beginner leagues)
- **Lower K:** Stable ratings (master level)

### Recalculate_Save Function

**Access:** Operations → Recalculate_Save

#### What It Does

1. **Validates all game results**
   - Checks format correctness
   - Verifies player existence
   - Detects conflicts between paired players

2. **Processes game results**
   - Parses result strings
   - Builds match database
   - Identifies all pairings

3. **Calculates new ratings**
   - Applies Elo formula to each game
   - Aggregates rating changes per player
   - Updates "New Rating" column

4. **Updates statistics**
   - Recalculates game counts
   - Updates win/loss/draw records

5. **Saves to storage**
   - Local: Updates localStorage
   - Server: Sends PUT request to update server data

#### Error Handling During Recalculation

If errors are found:
1. Recalculation pauses before applying rating changes
2. Error dialog shows first error
3. Options:
   - **Submit Correction:** Fix and continue to next error
   - **Clear Cell:** Remove invalid result
   - **Cancel:** Abort recalculation entirely

#### Post-Recalculation Actions

After successful recalculation:
- New ratings displayed in "N Rate" column
- Game counts updated
- Ready for "New Day" processing if desired

### New Day Processing

**Purpose:** Advance to next game title and finalize ratings

#### What Changes

1. **Title Progression**
   - Kings_Cross → Pawn_Game → Queen_Game → Bishop_Game → Pillar_Game → BG_Game → Bughouse Ladder → Ladder
   - Cycles back to start after completion

2. **Rating Finalization**
    - "New Rating" moves to "Previous Rating"
    - New rating calculations start fresh

3. **Game Count Recalculation**
    - Game count is recalculated from the game results array each new day
    - The application counts non-empty cells in the game grid and updates the Gms column
    - To manually adjust game counts: Export data, edit in spreadsheet (e.g., LibreOffice Calc), re-import

4. **Re-ranking Option**
   - Players can be re-sorted by rating
   - Maintains name associations
   - Updates rank numbers

#### New Day Procedure

1. Ensure all games entered and recalculated
2. Review new ratings
3. Process new day (functionality varies by version)
4. Confirm changes
5. Data saved automatically

---

## Advanced Features

### Walkthrough Mode

**Purpose:** Systematically review all game entries

#### Accessing Walkthrough

Triggered automatically when:
- Check Errors finds issues
- Manual entry via Operations menu (if available)

#### Walkthrough Navigation

| Action | Keyboard | Mouse |
|--------|----------|-------|
| Next Error | Ctrl+N | Next button |
| Previous Error | Ctrl+P | Previous button |
| Close | Escape | X button |

### Performance Monitoring

**Access:** Admin API endpoint `/api/admin/performance`

#### Metrics Tracked

- Request count and latency
- Error rates
- Data synchronization status
- Player count and game count

### Server Statistics

**Access:** Admin API endpoint `/api/admin/stats`

#### Available Statistics

- Total players
- Total games entered
- Current title/mini-game
- Last update timestamp
- Server uptime

---

## Troubleshooting and Maintenance

### Common Issues

#### Issue: Data Not Syncing to Server

**Symptoms:** Changes visible locally but not on other clients

**Diagnosis:**
1. Check browser console for errors
2. Verify server URL is correct
3. Check network tab for failed PUT requests

**Solutions:**
- Reload browser
- Verify server is running
- Check CORS configuration
- Manually trigger sync via settings toggle

#### Issue: Rating Calculation Seems Wrong

**Symptoms:** Unexpected rating changes after recalculation

**Diagnosis:**
1. Run Check Errors first
2. Review recent game entries
3. Verify opponent entries match

**Solutions:**
- Correct any errors found
- Check for missing opponent entries
- Verify W/L/D entered correctly

#### Issue: Players Missing After Load

**Symptoms:** Fewer players than expected after loading file

**Diagnosis:**
1. Check file format
2. Look for parse errors in console
3. Verify column alignment

**Solutions:**
- Re-save file in correct format
- Check for extra/missing tabs
- Verify header row matches expected format

### Data Recovery

#### From LocalStorage (Local Mode)

```javascript
// In browser console:
JSON.parse(localStorage.getItem('ladder_players'));
```

#### From Server

1. Go to admin export endpoint
2. Download current data
3. Or use File → Export in admin mode

### Backup Recommendations

1. **Before major operations:** Export current data
2. **Regular backups:** Weekly exports minimum
3. **Version control:** Keep dated backup files
4. **Server backups:** Ensure server has backup of data directory

### Maintenance Tasks

#### Daily
- [ ] Verify all games entered correctly
- [ ] Run Check Errors
- [ ] Recalculate ratings after each round

#### Weekly
- [ ] Export backup copy
- [ ] Review rating changes for anomalies
- [ ] Process New Day if title complete

#### Monthly
- [ ] Verify server backups exist
- [ ] Review and clean up player data
- [ ] Check for duplicate players

---

## API Reference (Admin Endpoints)

### Authentication Required

All admin endpoints require the Admin API Key in the `X-API-Key` header.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/upload` | Upload .tab file |
| GET | `/api/admin/export` | Export current data |
| POST | `/api/admin/process` | Process game results |
| POST | `/api/admin/regenerate` | Regenerate ratings |
| GET | `/api/admin/stats` | Get server statistics |
| GET | `/api/admin/performance` | Get performance metrics |
| POST | `/api/admin/performance/clear` | Clear performance data |

### Example: Export via API

```bash
curl -X GET http://localhost:3000/api/admin/export \
  -H "X-API-Key: your-admin-api-key"
```

---

## Security Considerations

### Admin API Key

- **Storage:** Browser localStorage (client), environment variable (server)
- **Transmission:** HTTP header with each admin request
- **Protection:** Never commit to version control

**Generate new key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rate Limiting

Admin endpoints have stricter rate limits:
- 10 authentication attempts per 15 minutes
- 100 API requests per 15 minutes (production)

### Access Control

| Feature | Local Mode | Server (No Key) | Server (With Key) |
|---------|------------|-----------------|-------------------|
| View data | ✅ | ✅ | ✅ |
| Enter games | ✅ | ✅ | ✅ |
| Load files | ✅ | ❌ | ✅ |
| Export data | ✅ | ❌ | ✅ |
| Add players | ✅ | ❌ | ✅ |
| Sort display | ✅ | ❌ | ✅ |

---

## Glossary

| Term | Definition |
|------|------------|
| **Rank** | Unique identifier for each player (1, 2, 3...) |
| **Round** | Game session number (columns in ladder) |
| **K-Factor** | Elo volatility multiplier (default: 32) |
| **New Rating** | Calculated rating after games processed |
| **Previous Rating** | Rating before current set of games |
| **Title** | Current mini-game (Kings_Cross, Pawn_Game, etc.) |
| **Admin Mode** | UI state enabling administrative features |

---

**Version:** 1.0  
**Last Updated:** April 2026  
**Prerequisites:** User Manual knowledge assumed
