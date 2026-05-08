# Tournament Flow Design

## Core Concept

Mini-game tournaments are a **special case** - not the default flow. When running a tournament, each mini-game (BG_Game, Bishop_Game, Pillar_Game, Kings_Cross, Pawn_Game, Queen_Game, bughouse) gets its **own saved .tab file**. All 7 files exist simultaneously during a tournament.

**No New-Day needed** - instead, you freely switch between mini-games using the title menu.

**All 7 mini-games are treated identically in code.** The 7 tournaments are semantically different but code-wise they are identical. No special-case handling for bughouse or any other mini-game. The same player copy logic, file saving, trophy calculation, and export apply to all 7 files.

## File Structure (Server-Side)

```
data/
├── club_ladder.tab              # Main club ladder (one per club)
├── BG_Game.tab                  # BG_Game mini-game ladder
├── Bishop_Game.tab              # Bishop_Game mini-game ladder
├── Pillar_Game.tab              # Pillar_Game mini-game ladder
├── Kings_Cross.tab              # Kings_Cross mini-game ladder
├── Pawn_Game.tab                # Pawn_Game mini-game ladder
├── Queen_Game.tab               # Queen_Game mini-game ladder
└── bughouse.tab                 # Bughouse mini-game ladder (7th file, same as others)
```

All 7 mini-game files are treated identically - same code paths, same logic, no special cases.

## Tournament Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN SELECTS MINI-GAME TITLE (e.g., BG_Game) FROM FILE MENU    │
│  - Tournament mode AUTOMATICALLY ACTIVATED                      │
│  - Players + ratings copied to BG_Game.tab                      │
│  - Status banner appears with quick actions                     │
│  - All 7 mini-game files exist simultaneously                   │
│  - New-Day is DISABLED during tournament mode                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  PLAY PHASE (Mini-Game Tournament)                              │
│                                                                  │
│  - Users enter game results as normal                           │
│  - Recalculate updates ratings within THIS mini-game ladder     │
│  - Players play each other ONCE per mini-game (deduplication)   │
│  - Add player works (new players join mid-tournament)           │
│  - Auto-letter works (groups shift as ratings change)           │
│  - View/HTML export shows standings                             │
└─────────────────────────────────────────────────────────────────┘
                               │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN SWITCHES MINI-GAME VIA TITLE MENU                        │
│  (e.g., BG_Game → Bishop_Game)                                  │
│                                                                  │
│  When switching to a NEW mini-game file (doesn't exist yet):    │
│  1. Load current active file (e.g., BG_Game.tab)                │
│  2. Copy players + ratings to new file (Bishop_Game.tab)        │
│  3. If player count differs: add new players                    │
│  4. Start with empty gameResults                                │
│                                                                  │
│  When switching to an EXISTING mini-game file:                  │
│  1. Load existing file (with accumulated results)               │
│  2. Resume playing (results already there)                      │
│  3. New results are appended to existing ones                   │
│                                                                  │
│  When switching AWAY from mini-game to "Ladder":                │
│  1. Confirmation dialog: "End tournament and switch to Ladder?" │
│  2. If yes: end tournament, files remain on disk                │
│  3. If no: stay on current mini-game                            │
│                                                                  │
│  Note: Files persist until "Clear Mini-Games" button is clicked │
│  in Settings (safer design to prevent accidental loss)          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  REPEAT FREELY                                                  │
│                                                                  │
│  You can switch between mini-games in ANY order:                │
│  - BG_Game → Bishop_Game → BG_Game → Pillar_Game → ...         │
│  - Each file accumulates independently                          │
│  - If BG_Game is played twice, results are merged               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  EXPORT / TROPHIES (Settings during tournament)                 │
│                                                                  │
│  - Export Tournament Files: ZIP of all 7 mini-game .tab files   │
│  - Generate Trophies: downloads trophy report .tab file         │
│  - Clear Mini-Games: deletes all 7 files + ends tournament      │
└─────────────────────────────────────────────────────────────────┘
```

## Settings Buttons During Tournament

| Button | When Visible | Action |
|--------|-------------|--------|
| **Clear Mini-Games** | Any mini-game files exist | Delete all 7 files, end tournament |
| **Export Tournament Files** | Tournament active | Download ZIP of all mini-game files |
| **Generate Trophies** | Tournament active | Download trophy report |

## Switching Mini-Games (The Key Mechanism)

### First Time Switching to a Mini-Game

When you switch to a mini-game file that doesn't exist yet:

1. **Source file**: The currently active mini-game file (e.g., BG_Game.tab)
2. **Target file**: The new mini-game file (e.g., Bishop_Game.tab)
3. **Copy players + ratings** from source to target
4. **If player count differs**: Add any new players from source that aren't in target
5. **Start with empty gameResults** (ready for new games)

### Switching to an Existing Mini-Game

When you switch to a mini-game file that already exists:

1. **Load existing file** (with accumulated results from previous sessions)
2. **Resume playing** - results are already there
3. **New results are appended** to existing ones
4. **File accumulates** - if you play BG_Game twice, both sessions' results are in the file

### Example Flow

```
1. Start tournament in BG_Game (20 players, 10 games played)
2. Switch to Bishop_Game → copy 20 players, start fresh
3. Play 8 games in Bishop_Game
4. Switch back to BG_Game → load existing BG_Game.tab (10 games)
5. Play 5 more games in BG_Game → now 15 total
6. Switch to Pillar_Game → copy 20 players (from Bishop_Game), start fresh
7. Play 12 games in Pillar_Game
8. End tournament
```

## Data Model

### Minimal Extensions

No changes to PlayerData needed. The saved .tab files on server ARE the history.

### Server-Side: Mini-Game File Storage

Each mini-game .tab file is stored on the server alongside the club ladder file:

```
data/
├── club_ladder.tab
├── BG_Game.tab
├── Bishop_Game.tab
├── Pillar_Game.tab
├── Kings_Cross.tab
├── Pawn_Game.tab
├── Queen_Game.tab
└── bughouse.tab  # Single file for bughouse (not per-mini-game)
```

### What Each Saved Mini-Game File Contains

- Player list (with ratings)
- Ratings (from when file was created or last updated)
- `num_games` = count of games in this file
- `gameResults` = all accumulated results (if played multiple times)
- Group assignments (auto-letter may have shifted players)

## Implementation Approach

### Phase 1: Tournament Mode Flag (Auto-Activated)

Tournament mode is **not** activated by a button. It is activated automatically when the admin selects a mini-game title (BG_Game, Bishop_Game, etc.) from the File menu.

Flag stored server-side (in-memory or in a small JSON file), not in PlayerData.

```typescript
// Server-side tournament state
interface TournamentState {
  active: boolean;
  startedAt: string;  // ISO timestamp
}
```

### Phase 2: Player Copy Logic on Mini-Game Switch

When admin switches to a new mini-game title during tournament mode:

1. **Check if target file exists** on server
2. **If doesn't exist**: Copy players + ratings from current active file
   - Match players by lastName + firstName
   - Copy rating, nRating, group, grade, etc.
   - If target has fewer players: add missing players from source
   - If target has more players: keep target players (don't remove)
3. **If exists**: Load existing file (no copying needed)
4. **Save target file** with copied/loaded data

This requires:
- Server-side file reading/writing for mini-game files
- Player matching logic (lastName + firstName)
- Player merge logic (add missing players)
- Title-to-filename mapping (handle spaces: `Kings_Cross` → `Kings_Cross.tab`)

### Phase 3: Export Mini-Game Files Endpoint

Add server endpoint to package all mini-game files:

```
GET /api/admin/tournament/export
```

Server:
1. Checks all 7 mini-game .tab files exist
2. Zips them together
3. Returns as downloadable response
4. Filename: `tournament_YYYY-MM-DD.zip`

## Trophy Awarding

Trophies are awarded by clicking **"Generate Trophies"** button in Settings. This is a read-only operation - it generates a report without modifying the ladder. Results go into a **trophy award tab file**.

### Auto-Detection: Club Ladder vs Mini-Game Tournament

The trophy system auto-detects the mode based on file presence:

- **Club ladder mode**: If NONE of the 7 mini-game files exist (`BG_Game.tab` through `bughouse.tab`) → Club ladder awards (uses club ladder rating for Gr 1st places)
- **Mini-game tournament mode**: If ANY mini-game file exists → Mini-game tournament awards (uses mini-game performance)

No toggle needed - the presence of mini-game files determines the mode.

### Trophy Pool

**Maximum 15 trophies available (mini-game tournament):**
- 7 × 1st places (one per mini-game)
- 7 × 2nd places (one per mini-game)
- 1 × Most games played (across all completed mini-games)

**Maximum 21+ trophies available (end-of-year / club ladder):**
- Same as above but based on club ladder performance
- Plus: 1st place per Gr (school grade, e.g., 5, 6, 7) after a blank row separator

**Capped at 1/3 of total player count** (round down).

### Mini-Game Difficulty Order (Hardest → Easiest)

1. Queen_Game (hardest)
2. Pawn_Game
3. Kings_Cross
4. Pillar_Game
5. Bishop_Game
6. BG_Game
7. bughouse (easiest)

### Awarding Sequence

```
1. Award 1st place for each COMPLETED mini-game (hardest first: Queen → Pawn → Kings_Cross → Pillar → Bishop → BG_Game → bughouse)
2. Award 2nd place for each COMPLETED mini-game (hardest first)
3. Fill remaining slots with "most games" players
   - Multiple players can tie for "most games" (OK to give more than one)
   - Count total games played across ALL completed mini-games
   - Award to top players by game count until slots are filled
4. [BLANK ROW - separator]
5. Award 1st place per Gr (school grade, 0=Kindergarten, 13=College) column value (highest Gr first: 13 → 12 → 11 → ...)
   - Based on club ladder rating (not mini-game rating)
   - Award to highest-rated player in each Gr group
   - Multiple trophies can be awarded for same Gr if slots remain
```

### Examples

**30 players = 10 trophy slots, all 7 mini-games played:**
- 7 × 1st places (all 7 mini-games) = 7 slots used
- 3 × 2nd places (hardest 3: Queen, Pawn, Kings_Cross) = 3 slots used
- 0 slots left for "most games"
- 0 slots left for grade 1st places

**40 players = 13 trophy slots, all 7 mini-games played:**
- 7 × 1st places = 7 slots used
- 6 × 2nd places = 13 slots used
- 0 slots left for "most games"
- 0 slots left for grade 1st places

**24 players = 8 trophy slots, only 4 mini-games played:**
- 4 × 1st places = 4 slots used
- 4 × 2nd places = 8 slots used
- 0 slots left for "most games"
- 0 slots left for grade 1st places

**45 players = 15 trophy slots, all 7 mini-games played:**
- 7 × 1st places = 7 slots used
- 7 × 2nd places = 14 slots used
- 1 slot left for "most games" → top 1 player by total games
- 0 slots left for grade 1st places

**60 players = 20 trophy slots, all 7 mini-games played:**
- 7 × 1st places = 7 slots used
- 7 × 2nd places = 14 slots used
- 1 slot left for "most games" → top 1 player by total games
- 5 slots left for Gr 1st places → top 5 Gr groups (Gr 12, Gr 11, Gr 10, Gr 9, Gr 8)

**80 players = 26 trophy slots, all 7 mini-games played:**
- 7 × 1st places = 7 slots used
- 7 × 2nd places = 14 slots used
- 1 slot left for "most games" → top 1 player by total games
- 11 slots left for Gr 1st places → top 11 Gr groups (Gr 12 through Gr 2)

### Trophy Report Format

Generated as a `.tab` file when admin clicks "Generate Trophies":

```
tournament_trophies_YYYY-MM-DD.tab

Columns:
Rank | Player | Gr | Trophy Type | Mini-Game/Grade | Games Played
1    | Smith  | 10 | 1st Place   | Queen_Game      | 12
2    | Jones  | 11 | 1st Place   | Pawn_Game       | 10
3    | Lee    | 10 | 2nd Place   | Kings_Cross     | 11
...
---  |        |   |             |                 |
     | Brown  | 12 | 1st Place   | Gr 12           | 45
     | Green  | 11 | 1st Place   | Gr 11           | 38
```

**Note**: "Games Played" for mini-game trophies counts games from ALL sessions of that mini-game (accumulated file).

**Notes:**
- `Gr` = school grade (0=Kindergarten, 1=1st, ..., 12=12th, 13=College)
- `Games Played` = total games in the mini-game (for mini-game trophies) or total career games (for Gr trophies)
- Blank row separator before Gr trophies
- Gr column used for determining Gr 1st place winners (highest Gr first: 13 → 12 → 11 → ...)
- Group column (A, A1, B, C, D) is separate and not used for trophy awards

### Clearing Mini-Game Results

After trophies are awarded and report is generated:

- Mini-game ladder files can be cleared for next tournament
- `gameResults` array reset to nulls
- `num_games` reset to 0
- Ratings preserved (or reset, depending on admin preference)

## API Additions

### New Endpoints

```
GET /api/admin/tournament/export
  - ZIPs all mini-game .tab files
  - Returns as downloadable response
  - Filename: tournament_YYYY-MM-DD.zip

POST /api/admin/tournament/clear-mini-games
  - Deletes all 7 mini-game .tab files
  - Returns deleted count

GET /api/admin/tournament/check-mini-games
  - Returns list of mini-game files with data
  - Used to block Load File when mini-games have data

POST /api/admin/tournament/add-player-to-mini-games
  - Adds new player to all existing mini-game files

GET /api/admin/export-mini-data
  - ZIPs ladder.tab + any mini-game files with data
  - Filename: mini_data_YYYY-MM-DD.zip
```

### Server State

Tournament mode state stored server-side (not in PlayerData or .tab files):

- In-memory during runtime
- Persisted to `data/tournament_state.json` for recovery after restart
- Interface: `{ active: boolean; startedAt: string }` — no `mode` field (all mini-games treated identically)

## Key Design Decisions

1. **Mini-games are a special case** - Not the default flow, activated by selecting mini-game title from File menu
2. **Each mini-game is a real .tab file** - All 7 files exist simultaneously during tournament
3. **No New-Day needed** - Switching between mini-games uses player copy logic instead
4. **Self-contained results** - Each mini-game ladder only depends on its own results
5. **Export, don't integrate** - Cross-ladder merge is too hard; admin exports files for archival
6. **Server-side storage** - Mini-game files stored on server, not in client localStorage
7. **Existing features cover the rest** - View mode (HTML export), add player, auto-letter all work
8. **Minimal data model** - No PlayerData changes needed; saved files ARE the history
9. **All 7 mini-games use identical code** - No special-case handling for bughouse or any other mini-game. Same player copy logic, file saving, trophy calculation, and export apply to all 7 files
10. **Tournament state is server-side** - Flag stored in memory, not in PlayerData
11. **Trophies in report tab file** - Generated at end of tournament, not in `trophyEligible` column
12. **Partial tournaments supported** - If only 4 of 7 mini-games are played, only award those
13. **Most games can tie** - Multiple players can receive "most games" trophy if tied
14. **Mini-game files accumulate** - If same mini-game played multiple times, results are merged (not overwritten)
15. **Dual-purpose trophy system** - Works for mini-game tournaments AND end-of-year club ladder awards
16. **Grade 1st place uses club ladder rating** - Not mini-game rating, for end-of-year mode only
17. **Files persist on switch-away** - Switching from mini-game to Ladder shows confirmation but files remain until "Clear Mini-Games" in Settings (prevents accidental loss)

## Open Questions

1. **Should exported ZIP include metadata?** - Date, admin name, list of files included
2. **What happens if admin switches title manually during tournament?** - Does it break the flow?
3. **Should completed mini-game files be archived with timestamps?** - e.g., `BG_Game_2024-01-15.tab` to avoid overwriting
4. **For bughouse tournaments, any special file naming?** - e.g., `Bughouse_BG_Game.tab`
5. **Should export include the club ladder file too?** - Or just the mini-game files?
6. **After trophies awarded, should mini-game results auto-clear?** - Or leave it to admin?
7. **Gr order for 1st place** - Highest Gr first (13 → 12 → 11 → ...)? Or different order?
8. **Gr 1st place tiebreaker** - If two players in same Gr have same rating, who gets the trophy?
9. **Multiple trophies for same Gr** - If Gr 10 has 3 slots left, do top 3 players all get 1st place trophies?
