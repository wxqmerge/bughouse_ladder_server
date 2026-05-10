# Tournament Flow Design

## Core Concept

Mini-game tournaments are a **special case** - not the default flow. When running a tournament, each mini-game (BG_Game, Bishop_Game, Pillar_Game, Kings_Cross, Pawn_Game, Queen_Game, bughouse) gets its **own saved .tab file**. All 7 files exist simultaneously during a tournament.

**No New-Day needed** - instead, you freely switch between mini-games using the title menu.

**All 7 mini-games are treated identically in code.** The 7 tournaments are semantically different but code-wise they are identical. No special-case handling for bughouse or any other mini-game. The same player copy logic, file saving, trophy calculation, and export apply to all 7 files.

**Multi-client support:** Multiple clients can view and enter results in different mini-games simultaneously. Each client's DataService tracks its own `currentMiniGameFile`, routing all operations (read, write, submit game result, update player, clear cell) to the correct mini-game file.

## Storage (Dual-Mode)

Mini-game files are stored differently depending on mode:

- **Server mode**: Files stored on disk in `data/` directory (same as club ladder)
- **Local mode**: Files stored in `localStorage` (one entry per mini-game file, prefixed `mini_game_`)

Both modes use the same `MiniGameStore` interface — the code path is identical, only the backend differs.

### Server-Side File Structure

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

### Local Mode Storage

```
localStorage:
  mini_game_BG_Game.tab        # BG_Game mini-game ladder
  mini_game_Bishop_Game.tab    # Bishop_Game mini-game ladder
  mini_game_Pillar_Game.tab    # Pillar_Game mini-game ladder
  mini_game_Kings_Cross.tab    # Kings_Cross mini-game ladder
  mini_game_Pawn_Game.tab      # Pawn_Game mini-game ladder
  mini_game_Queen_Game.tab     # Queen_Game mini-game ladder
  mini_game_bughouse.tab       # Bughouse mini-game ladder (7th file, same as others)
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

When the admin switches to a mini-game title from the File menu, the ladder form **switches its data source** from `ladder.tab` to the mini-game file. All subsequent operations (read, write, submit game results, update players) route to that mini-game file.

### First Time Switching to a Mini-Game

When you switch to a mini-game file that doesn't exist yet:

1. **Copy players + ratings** from club ladder (or active mini-game) to the new file
2. **Start with empty gameResults** (ready for new games)
3. **Switch data source** — all ladder operations now read/write to this mini-game file

### Switching to an Existing Mini-Game

When you switch to a mini-game file that already exists:

1. **Load existing file** (with accumulated results from previous sessions)
2. **Switch data source** — all ladder operations now read/write to this mini-game file
3. **Resume playing** - results are already there
4. **New results are appended** to existing ones
5. **File accumulates** - if you play BG_Game twice, both sessions' results are in the file

### Switching Away from a Mini-Game

When you switch from a mini-game back to "Ladder":

1. **Reset data source** — all ladder operations now read/write to `ladder.tab` again
2. Confirmation dialog shown to prevent accidental loss

### Multi-Client Support

Multiple clients can view and enter results in different mini-games simultaneously:

- **Client A** switches to bughouse → all operations route to `bughouse.tab`
- **Client B** switches to BG_Game → all operations route to `BG_Game.tab`
- Each client's `DataService` has its own `currentMiniGameFile` — no cross-contamination
- Individual cell operations (`submitGameResult`, `updatePlayer`, `clearPlayerCell`) all check `currentMiniGameFile` and route correctly

### Example Flow

```
1. Start tournament in BG_Game (20 players, 10 games played)
2. Switch to Bishop_Game → copy 20 players, start fresh, switch data source
3. Play 8 games in Bishop_Game
4. Switch back to BG_Game → load existing BG_Game.tab (10 games), switch data source
5. Play 5 more games in BG_Game → now 15 total
6. Switch to Pillar_Game → copy 20 players (from Bishop_Game), start fresh, switch data source
7. Play 12 games in Pillar_Game
8. End tournament
```

## Data Model

### Minimal Extensions

No changes to PlayerData needed. The saved .tab files on server ARE the history.

### Mini-Game File Storage (Dual-Mode)

Each mini-game .tab file is stored on the server alongside the club ladder file, or in localStorage for local mode:

```
data/ (server) or localStorage (local):
├── club_ladder.tab / ladder_players
├── BG_Game.tab / mini_game_BG_Game.tab
├── Bishop_Game.tab / mini_game_Bishop_Game.tab
├── Pillar_Game.tab / mini_game_Pillar_Game.tab
├── Kings_Cross.tab / mini_game_Kings_Cross.tab
├── Pawn_Game.tab / mini_game_Pawn_Game.tab
├── Queen_Game.tab / mini_game_Queen_Game.tab
└── bughouse.tab / mini_game_bughouse.tab  # Single file for bughouse (not per-mini-game)
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

Flag stored server-side (in-memory or in a small JSON file) for server mode, or in `localStorage` for local mode.

```typescript
// Server-side tournament state
interface TournamentState {
  active: boolean;
  startedAt: string;  // ISO timestamp
}

// Local mode: stored in localStorage key 'ladder_tournament_state'
```

### Phase 2: Player Copy Logic on Mini-Game Switch

When admin switches to a new mini-game title during tournament mode:

1. **Check if target file exists** (on server or in localStorage)
2. **If doesn't exist**: Copy players + ratings from current active file
   - Match players by lastName + firstName
   - Copy rating, nRating, group, grade, etc.
   - If target has fewer players: add missing players from source
   - If target has more players: keep target players (don't remove)
3. **If exists**: Load existing file (no copying needed)
4. **Save target file** with copied/loaded data

This requires:
- `MiniGameStore` interface (abstracts storage backend)
- Player matching logic (lastName + firstName)
- Player merge logic (add missing players)
- Title-to-filename mapping (handle spaces: `Kings_Cross` → `Kings_Cross.tab`)

Two implementations of `MiniGameStore`:
- **Server**: `tournamentStore` in `tournamentService.ts` — reads/writes `.tab` files to `data/` directory
- **Client (local)**: `miniGameStore` in `miniGameLocalStorage.ts` — reads/writes to `localStorage`

### Phase 3: Data Source Switching (Mini-Game File Routing)

When switching to a mini-game title, the `DataService` sets `currentMiniGameFile` to the mini-game file name. All subsequent operations route through the mini-game file instead of `ladder.tab`:

- **`getPlayers()`** — reads from mini-game file (server: `GET /api/admin/tournament/read-mini-game`, local: `miniGameStore.readMiniGameFile()`)
- **`savePlayers()`** — writes to mini-game file (server: `POST /api/admin/tournament/write-mini-game`, local: `miniGameStore.writeMiniGameFile()`)
- **`submitGameResult()`** — reads mini-game file, updates cell, writes back
- **`updatePlayer()`** — reads mini-game file, updates player, writes back
- **`clearPlayerCell()`** — reads mini-game file, clears cell, writes back
- **`refreshData()` / polling** — polls mini-game file when `currentMiniGameFile` is set

When switching back to "Ladder", `currentMiniGameFile` is reset to `null`, routing all operations back to `ladder.tab`.

### Phase 4: Export Mini-Game Files Endpoint

Add server endpoint to package all mini-game files:

```
GET /api/admin/tournament/export
```

Server:
1. Checks all 7 mini-game .tab files exist
2. Zips them together
3. Returns as downloadable response
4. Filename: `tournament_YYYY-MM-DD.zip`

Local mode: returns combined text blob with `=== filename.tab ===` headers between each file's content.

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
- 1st, 2nd, 3rd place overall + Most Games
- Plus: 1st, 2nd, 3rd place per Gr (school grade, e.g., 5, 6, 7)

**Trophy count = ceil(players / 3)** — this is a floor, not a cap. Mini-game 1st/2nd places and grade trophies are always awarded regardless of count.

### Mini-Game Difficulty Order (Hardest → Easiest)

1. Queen_Game (hardest)
2. Pawn_Game
3. Kings_Cross
4. Pillar_Game
5. Bishop_Game
6. BG_Game
7. bughouse (easiest)

### Mini-Game Tournament Awarding Sequence

```
Let m = number of completed mini-games
Let n = number of players
Let t = ceil(n / 3) = available trophy slots

1. Award 1st place for each COMPLETED mini-game (always, hardest first: Queen → Pawn → Kings_Cross → Pillar → Bishop → BG_Game → bughouse)
   - Player must have at least one game result in that mini-game
2. Award 2nd place for each COMPLETED mini-game (only if t > m)
   - Player must have at least one game result in that mini-game
3. Award grade 1st place (only if t > 2*m)
   - Remaining players (no trophy yet), sorted by num_games
   - First player by num_games in each grade wins
   - One trophy per grade
```

### Club Ladder Awarding Sequence

```
Let n = number of players
Let t = ceil(n / 3) = available trophy slots

1. Award 1st place overall (always) — highest rated player
2. Award 2nd place overall (always) — 2nd highest rated player
3. Award 3rd place overall (always) — 3rd highest rated player
4. Award Most Games (always) — player with most games played
5. Award grade 1st place (only if t > 4)
   - Highest rated player in each grade wins
   - One trophy per grade
6. Award grade 2nd place (only if trophies remain)
   - 2nd highest rated player in each grade wins
7. Award grade 3rd place (only if trophies remain)
   - 3rd highest rated player in each grade wins
```

**Rules for both modes:**
- One trophy per player — first-come-first-served by award order
- If any grade gets trophies, ALL grades must receive trophies
- Ties are OK — better to give too many trophies than too few

### Mini-Game Tournament Examples

**7 players, all 7 mini-games played (t=7, m=7):**
- 7 × 1st places = 7 trophies (1 per player, all won 1st)
- 2nd place skipped (t = m, not t > m)
- Grade 1st skipped (t = m, not t > 2*m)
- Total: 7 trophies

**7 players, all 7 mini-games played, 21 trophy slots (t=21, m=7):**
- 7 × 1st places = 7 trophies
- 7 × 2nd places = 14 trophies (t > m ✓)
- 7 × grade 1st places = 21 trophies (t > 2*m ✓, one per grade)
- Total: 21 trophies

**30 players = 10 trophy slots, all 7 mini-games played (t=10, m=7):**
- 7 × 1st places = 7 trophies
- 7 × 2nd places = 14 trophies (t > m ✓)
- Grade 1st skipped (t=10 ≤ 2*m=14)
- Total: 14 trophies

**24 players = 8 trophy slots, only 4 mini-games played (t=8, m=4):**
- 4 × 1st places = 4 trophies
- 4 × 2nd places = 8 trophies (t > m ✓)
- Grade 1st skipped (t=8 ≤ 2*m=8)
- Total: 8 trophies

**45 players = 15 trophy slots, all 7 mini-games played (t=15, m=7):**
- 7 × 1st places = 7 trophies
- 7 × 2nd places = 14 trophies (t > m ✓)
- Grade 1st awarded (t=15 > 14 ✓, one per grade)
- Total: 15+ trophies

**60 players = 20 trophy slots, all 7 mini-games played (t=20, m=7):**
- 7 × 1st places = 7 trophies
- 7 × 2nd places = 14 trophies (t > m ✓)
- Grade 1st awarded (t=20 > 14 ✓, one per grade)
- Total: 15+ trophies

**80 players = 27 trophy slots, all 7 mini-games played (t=27, m=7):**
- 7 × 1st places = 7 trophies
- 7 × 2nd places = 14 trophies (t > m ✓)
- Grade 1st awarded (t=27 > 14 ✓, one per grade)
- Total: 15+ trophies

### Club Ladder Examples

**10 players = 4 trophy slots (t=4):**
- 1st, 2nd, 3rd overall = 3 trophies
- Most Games = 4 trophies
- Grade 1st skipped (t ≤ 4)
- Total: 4 trophies

**16 players = 6 trophy slots (t=6):**
- 1st, 2nd, 3rd overall = 3 trophies
- Most Games = 4 trophies
- Grade 1st awarded (t > 4 ✓, one per grade)
- Total: 5+ trophies

**30 players = 10 trophy slots (t=10):**
- 1st, 2nd, 3rd overall = 3 trophies
- Most Games = 4 trophies
- Grade 1st awarded (t > 4 ✓, one per grade)
- Grade 2nd awarded (trophies remain ✓, one per grade)
- Total: 6+ trophies

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
     | Davis  | 11 | 1st Place   | Gr 11           | 38
     | Clark  | 10 | 1st Place   | Gr 10           | 30
     | White  | 12 | 2nd Place   | Gr 12           | 42
     | Green  | 11 | 2nd Place   | Gr 11           | 35
     | Adams  | 10 | 2nd Place   | Gr 10           | 28
     | Lee    | 12 | 3rd Place   | Gr 12           | 40
     | Clark  | 11 | 3rd Place   | Gr 11           | 33
     | White  | 10 | 3rd Place   | Gr 10           | 26
```

**Note**: In mini-game tournaments, grade trophies are awarded to one player per grade (highest num_games). In club ladder mode, grade 1st place goes to highest rated player per grade.

**Note**: "Games Played" for mini-game trophies counts games from ALL sessions of that mini-game (accumulated file).

**Notes:**
- `Gr` = school grade (0=Kindergarten, 1=1st, ..., 12=12th, 13=College)
- `Games Played` = total games in the mini-game (for mini-game trophies) or total career games (for Gr trophies)
- Blank row separator before Gr trophies (mini-game mode only)
- Gr column used for determining Gr trophy winners (highest Gr first: 13 → 12 → 11 → ...)
- Group column (A, A1, B, C, D) is separate and not used for trophy awards

### Clearing Mini-Game Results

After trophies are awarded and report is generated:

- Mini-game ladder files can be cleared for next tournament
- `gameResults` array reset to nulls
- `num_games` reset to 0
- Ratings preserved (or reset, depending on admin preference)

## API Additions (Server-Only)

All mini-game operations also work in local mode via `MiniGameStore` in `localStorage` — no API calls needed.

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

GET /api/admin/tournament/read-mini-game?fileName=...
  - Reads a single mini-game file
  - Returns players array (used for data source switching)

POST /api/admin/tournament/write-mini-game
  - Writes players array to a mini-game file
  - Used for all game result submissions, player updates, cell clears

GET /api/admin/export-mini-data
  - ZIPs ladder.tab + any mini-game files with data
  - Filename: mini_data_YYYY-MM-DD.zip
```

### Client-Side Mini-Game Operations (Local Mode)

In local mode, all mini-game operations go through `MiniGameStore` interface — no HTTP calls:

```typescript
// DataService routes to MiniGameStore when mode === LOCAL
dataService.clearMiniGames()           → miniGameStore.clearMiniGames()
dataService.copyPlayersToMiniGame()    → miniGameStore.read/writeMiniGameFile()
dataService.checkMiniGameFiles()       → miniGameStore.checkMiniGameFilesWith()
dataService.addPlayerToMiniGames()     → miniGameStore.addPlayerToAllMiniGames()
dataService.generateTrophyReport()     → miniGameStore.generateTrophyReport()
dataService.exportTournamentFiles()    → combined text blob with `=== filename.tab ===` headers
dataService.exportMiniData()           → combined text blob with `=== filename.tab ===` headers
```

### Tournament State

Tournament mode state stored server-side (not in PlayerData or .tab files):

- **Server mode**: In-memory during runtime, persisted to `data/tournament_state.json` for recovery after restart
- **Local mode**: Stored in `localStorage` key `ladder_tournament_state`
- Interface: `{ active: boolean; startedAt: string }` — no `mode` field (all mini-games treated identically)

## Key Design Decisions

1. **Mini-games are a special case** - Not the default flow, activated by selecting mini-game title from File menu
2. **Each mini-game is a real .tab file** - All 7 files exist simultaneously during tournament
3. **No New-Day needed** - Switching between mini-games uses player copy logic instead
4. **Self-contained results** - Each mini-game ladder only depends on its own results
5. **Export, don't integrate** - Cross-ladder merge is too hard; admin exports files for archival
6. **Dual-mode storage** - Mini-game files stored on server (`data/` directory) in server mode, or in `localStorage` in local mode. Both modes share the same `MiniGameStore` interface and code path — no special-case handling
7. **Existing features cover the rest** - View mode (HTML export), add player, auto-letter all work
8. **Minimal data model** - No PlayerData changes needed; saved files ARE the history
9. **All 7 mini-games use identical code** - No special-case handling for bughouse or any other mini-game. Same player copy logic, file saving, trophy calculation, and export apply to all 7 files
10. **Tournament state is dual-mode** - Stored in memory + `tournament_state.json` for server mode, or in `localStorage` for local mode
11. **Trophies in report tab file** - Generated at end of tournament, not in `trophyEligible` column
12. **Partial tournaments supported** - If only 4 of 7 mini-games are played, only award those
13. **Most games can tie** - Multiple players can receive "most games" trophy if tied
14. **Mini-game files accumulate** - If same mini-game played multiple times in the same tournament, results are merged (not overwritten)
15. **Mini-games are separate ladders** - Same players across all 7 mini-games, but each mini-game has its own independent game results that persist across switches
16. **copyPlayersToMiniGame preserves results** - When switching to a mini-game title, existing game results in the file are preserved (not cleared or reset); only players metadata (rating, grade, etc.) is updated from club ladder
17. **Clear Mini-Games / Clear All deletes files in local mode** - `handleClearAll` and `handleClearMiniGames` always call `dataService.clearMiniGames()` regardless of mode, ensuring localStorage mini-game keys are deleted
18. **Dual-purpose trophy system** - Works for mini-game tournaments AND end-of-year club ladder awards
19. **Grade 1st place uses club ladder rating** - Not mini-game rating, for end-of-year mode only
20. **Files persist on switch-away** - Switching from mini-game to Ladder shows confirmation but files remain until "Clear Mini-Games" in Settings (prevents accidental loss)
21. **Mini-game trophies** - 1st place always awarded, 2nd place only if t > m, grade 1st only if t > 2*m
22. **Club ladder trophies** - 1st/2nd/3rd overall + Most Games always awarded, grade 1st if t > 4, grade 2nd/3rd if trophies remain
23. **One trophy per player** - Each player can only receive one trophy (first-come-first-served by award order)
24. **Must have games to win** - Player must have at least one game result in a mini-game to win that mini-game's 1st/2nd place trophy
25. **1/3 ratio is a floor, not a cap** - Trophy count = ceil(players / 3), but mini-game 1st/2nd places and grade trophies are always awarded regardless of count
26. **Grade completeness** - If any grade gets trophies, ALL grades must receive trophies
27. **Local mode export** - Returns combined text blob with `=== filename.tab ===` headers between each file (acceptable, no ZIP support in localStorage)
28. **Manual title switch during tournament** - Should be prevented (admin must use "Clear Mini-Games" in Settings to end tournament)
29. **Bughouse file naming** - Bughouse is treated as just another mini-game, no special naming like `Bughouse_BG_Game.tab`
30. **ZIP metadata** - Keep it simple, no extra metadata in exported ZIP
31. **Mini-game files not archived with timestamps** - Files are overwritten/merged, zip/blob is the backup
32. **Export includes club ladder** - Export (ZIP for server, blob for local) includes club_ladder.tab + all mini-game files
33. **No auto-clear after trophies** - Mini-game results persist; admin uses "Clear Mini-Games" when ready
34. **Export files are time/date stamped** - ZIP filename: `tournament_YYYY-MM-DD.zip`, trophy: `tournament_trophies_YYYY-MM-DD.tab`, mini data: `mini_data_YYYY-MM-DD.zip`
35. **Data source switching** - `DataService` tracks `currentMiniGameFile`; all operations (`getPlayers`, `savePlayers`, `submitGameResult`, `updatePlayer`, `clearPlayerCell`) route to the mini-game file when set, or to `ladder.tab` when null
36. **Multi-client support** - Multiple clients can view and enter results in different mini-games simultaneously; each client's `DataService` has its own `currentMiniGameFile` — no cross-contamination

## Open Questions

(none remaining)
