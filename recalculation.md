# Recalculation System — Implementation Reference

> Current as of: 2026-04-23

---

## 1. Overview

The recalculation system processes game results from all players, validates them against a hash table to detect conflicts, rebuilds the game result grid, and recalculates Elo-based ratings using blended performance ratings for players with fewer than 10 career games.

There are **three recalculation paths**:

| Function | Trigger | Mode | Behavior |
|---|---|---|---|
| `recalculateRatings()` | "Recalculate" button | All modes | Builds matches from current UI, recalculates, saves, ends batch |
| `recalculateAndSave()` | "Recalculate & Save" button | Admin/User | Fetches fresh server data first, then recalculates with full server round-trip |
| File import → `handleConfirmImport` | Load file in admin mode | Admin only | Loads .tab file, shows confirmation dialog, saves to server |

---

## 2. Entry Points

### 2.1 `recalculateRatings()` — LadderForm.tsx:1129

**Flow:**

1. Log button press with player count and admin status
2. Clear all save status (underscore markers)
3. Start batch mode (`startBatch()`) — defers server sync
4. Call `checkGameErrors()` → wraps `checkGameErrorsWithPlayers(players)`
5. If errors exist, show error dialog and return early (batch stays open)
6. Count existing game results before clearing
7. Call `repopulateGameResults(players, matches, 31)` — clears all cells, writes validated results with `_` suffix
8. Call `calculateRatings(processedPlayers, matches)` — computes new nRating values
9. Check for pending New Day operation (localStorage key `ladder_pending_newday`)
   - If present: apply transformations, save, update project name to next mini-game title, **reload page**
10. Set players state + call `savePlayers(calculatedPlayers)` (writes to batch buffer during batch)
11. Call `endBatch()` — commits buffer to localStorage + syncs once to server
12. Clear status bar

### 2.2 `recalculateAndSave()` — LadderForm.tsx:1278

**Flow:**

1. Check for pending New Day operation first (same as above)
2. **Admin mode branch** (lines 1345-1450):
   - Clear all save status
   - Fetch fresh data from server (`GET /api/ladder`)
   - Merge: take player data/gameResults from server, preserve local nRating values
   - Build matches from merged data via `checkGameErrorsWithPlayers(mergePlayers)`
   - If errors → return early (no save)
   - Repopulate game results from validated matches
   - Calculate ratings on repopulated players
   - Save with `waitForServer=true` — blocks until server confirms
   - Clear local changes flag and pending deletes
   - Set players state
3. **User mode branch** (lines 1452-1514):
   - Same recalculation flow
   - Push full table to server (`savePlayers` with `waitForServer=true`)
   - Pull fresh data back from server to ensure UI matches exactly
   - Set players state from server response

### 2.3 File Import → Admin Mode — LadderForm.tsx:557-751

**Flow:**

1. `loadPlayers(file)` reads .tab file via FileReader
2. Parse header line (skip if starts with "Group")
3. Parse each data line into PlayerData objects using tab-split columns
4. Column mapping: rank=cols[4], group=cols[0], lastName=cols[1], firstName=cols[2], rating=cols[3], nRating=cols[5], grade=cols[6], num_games=cols[7], gameResults=cols[13..43]
5. Empty/blank/undefined ratings default to 1 (not -1)
6. Header Round 1 column (cols[13]) must contain "1" — warns if not
7. Max 200 players (slice excess)
8. Remove only ladder-specific localStorage keys (preserves user settings):
   - `ladder_players`, `ladder_project_name`, `ladder_settings`, `ladder_saved_cells`, `ladder_zoom_level`
   - `ladder_ladder_players`, `ladder_server_ladder_players`
9. Sort loaded players by current sortBy criteria
10. Save to localStorage (`ladder_players`)
11. **Admin mode**: Show confirmation dialog with `pendingImport` state (player count, rounds filled, games played)
12. **Non-admin mode**: Set players directly
13. `handleConfirmImport()` → calls `savePlayers(pendingImport.players, true)` with `waitForServer=true`

---

## 3. Game Validation — `processGameResults()` — hashUtils.ts:435

**Input:** `PlayerData[]`, `numRounds=31`
**Output:** `{ matches, hasErrors, errorCount, errors, playerResultsByMatch }`

### 3.1 Hash Table

- Local hash table: 2048 entries with linear probing
- Hash function: text encoder on key string, first byte + digit accumulation, modulo 2048
- Used to validate that each game result appears exactly once (no duplicates)

### 3.2 Result String Encoding

`RESULT_STRING = "OLDWXYZ__________"` — used for both parsing and score extraction:

| Index | Char | Score Value | Meaning |
|---|---|---|---|
| 0 | O | 0 | Opponent/bye |
| 1 | L | 1 | Loss |
| 2 | D | 2 | Draw |
| 3 | W | 3 | Win |
| 4+ | X/Y/Z/_ | — | Not used for scores |

**Score interpretation:** score=3 → WIN, score=1 → LOSS

### 3.3 Parsing — `parseEntry()` / `string2long()`

Parses game entry strings like `"23:29LW"` or `"5L12"`:

1. Normalize to uppercase
2. Parse digits (player ranks) and characters (W/L/D scores)
3. Colon `:` separates pairs within same team (4-player games)
4. Underscore `_` at end of string = separator — breaks if at end of string
5. Player order normalization: sort within each team, sort teams by lowest player
6. For 4-player games with swapped sides, invert scores: `score = 4 - score`

### 3.4 Error Codes (negative return values from parseEntry)

| Code | Meaning |
|---|---|
| -1 | Underscore at end of string |
| -2 | Invalid character |
| -3 | Incomplete entry (< 2 players or < 1 result) |
| -4 | Duplicate player (self-play) |
| -5 | Too many results |
| -7 | Missing player 4 in 4-player game |
| -9 | Player rank > 200 |

### 3.5 Deduplication Strategy

**Intra-round dedup:** `processedPairs` Set using normalized key (sorted player ranks)
- Prevents same match from being counted twice within a round
- Works across both 2-player and 4-player formats

**Global dedup:** `processedMatches` Set — prevents same match appearing in multiple rounds

### 3.6 Conflict Detection

After parsing all results, the system checks each match key for conflicting result strings:

1. Group entries by normalized key (sorted players)
2. For each group with 2+ entries, normalize all to canonical form using `normalizeResultForComparison()`
3. If any differ → error code 10 (conflicting results)
4. Only one error per conflict is reported (using first entry as primary)

### 3.7 Score Swapping for Perspective Normalization

`swapScore(code)`: O→O, L→W, D→D, W→L (i.e., `code === 0 ? 0 : 4 - code`)

Used when the same 4-player game is entered from different players' perspectives. The canonical form always has the team with the lower minimum player rank listed first.

---

## 4. Rating Calculation — `calculateRatings()` — hashUtils.ts:845

**Input:** `PlayerData[]`, `MatchData[]`, optional `_kFactorOverride`
**Output:** `PlayerData[]` (mutated nRating values)

### 4.1 Configuration

- kFactor defaults to 20, read from localStorage `ladder_settings.kFactor`
- perfBlendingFactor defaults to 0.99, read from localStorage `ladder_settings.performanceBlendingFactor`

### 4.2 Effective Rating Snapshot (before Elo loop)

```typescript
effectiveRatings.set(p.rank, Math.abs(p.nRating > 0 ? p.nRating : p.rating));
```

This snapshot is critical: it captures each player's rating **before** the Elo loop starts mutating nRating values. Without this, earlier matches in the loop would use partially-updated ratings for later matches, creating asymmetry (e.g., Player A's rating used for B's calculation would differ from B's rating used for A's if they played multiple rounds).

### 4.3 Elo Loop

Iterates over all validated matches:

1. Find p1 and p2 players
2. Look up effective ratings via `getOpponentRating()` (uses snapshot map, falls back to `Math.abs(player.rating)`)
3. Compute expected scores using Elo formula: `1 / (1 + 10^(|oppRating - myRating| / 400))`
4. Determine actual scores: score=3 → actual=1/0, score=1 → actual=0/1, else 0.5/0.5
5. Accumulate per-player stats: `score`, `opponentRatings[]`, `gamesToday`
6. Update nRating: `nRating = round(rating + EloK * (actual - expected))`
7. **Note:** Current code uses `Math.max(0, ...)` — clamps to 0 minimum (TODO: should allow negatives for trophy ineligibility signal)

### 4.4 Performance Rating (post-loop)

For each player with games today:

1. **Average rating** = sum of all opponent effective ratings + self effective rating, divided by (opponent count + 1)
   - Self is included in the average to prevent inflation when playing fewer opponents than average

2. **Performance rating**:
   - Win rate > 0.5: `avgRating + 200`
   - Win rate < 0.5: `avgRating - 200`
   - Win rate = 0.5: `avgRating` (exactly even)

3. **Clamping:** perfRating clamped to [-9999, 9999]

### 4.5 Blending Logic

| Condition | Formula |
|---|---|
| `num_games === 0` | `nRating = round(perfRating)` — raw performance rating, no damping |
| `num_games < 10` | **Blended:** `(perfBlendingFactor * ((rating * num_games + perfRating * gamesToday) / (num_games + gamesToday)))` |
| `num_games >= 10` | No change — keeps Elo-calculated nRating from the loop |

The blending factor (default 0.99) slightly dampens the performance component for new players, pulling the blended rating closer to their historical rating.

### 4.6 Elo Formula

```typescript
formula(myRating: number, opponentsRating: number): number {
  return 1 / (1 + 10 ** (Math.abs(opponentsRating) - Math.abs(myRating)) / 400);
}
```

Uses absolute values of ratings — negative ratings are treated as their magnitude for Elo calculations.

---

## 5. Game Result Rebuilding — `repopulateGameResults()` — hashUtils.ts:988

**Input:** `PlayerData[]`, `MatchData[]`, `numRounds=31`, optional `playerResultsByMatch`
**Output:** `PlayerData[]` with fresh gameResults array

### 5.1 Process

1. Create new player copies with `gameResults: new Array(31).fill(null)` — clears ALL cells
2. For each validated match, build a **normalized result string**:
   - 2-player: `"p1ScoreLetterp2"` (players sorted by rank)
   - 4-player: `"p1:p2Score1Score2p3:p4"` (teams sorted internally and externally)
3. For each participant, find lowest empty round index
4. Write result with `_` suffix: `normalizedResult + "_"` (marks as "saved")

### 5.2 Score-to-Letter Mapping

| Code | Letter |
|---|---|
| 0 | O |
| 1 | L |
| 2 | D |
| 3 | W |

### 5.3 Perspective Swapping in Rebuilding

When building the normalized result, if the team with the higher minimum player rank is listed first, scores are swapped using `swapScore()` so the canonical form always has the lower-rank team first.

---

## 6. Storage & Sync — `savePlayers()` — storageService.ts:463

**Signature:** `savePlayers(players, waitForServer=false, skipServerSync=false)`

### 6.1 Batch Mode Handling

During batch mode (`isInBatch() === true`):
- Player data is written to `batchBuffer` instead of localStorage
- Returns `{ success: true, serverSynced: false }` immediately
- No localStorage writes, no server sync

### 6.2 Mode Detection

```typescript
const mode = dataService.getMode();  // LOCAL | DEVELOPMENT | SERVER
const serverUrl = userSettings.server?.trim() || '';
```

**Mode determination** (dataService.ts:444):
1. If `userSettings.server` is set and non-empty → use it
   - Contains "localhost" or "127.0.0.1" → `DEVELOPMENT` mode
   - Otherwise → `SERVER` mode
2. If no server configured → `LOCAL` mode

**Key behavior:** `savePlayers` checks BOTH `mode === LOCAL` AND `!serverUrl`. If mode is DEVELOPMENT but server URL exists, it falls through to the server branch (prevents the "no server sync" bug).

### 6.3 Save Paths

| Condition | Action |
|---|---|
| `mode === LOCAL && !serverUrl` | Write to `ladder_ladder_players` only. Mark all cells as saved. Return immediately. |
| `waitForServer === true` | Write to both localStorage keys. POST PUT to server, **wait for response**. Mark cells as saved on success. Reset hash. |
| `skipServerSync === true` | Write to both localStorage keys. Log cache-only message. Return immediately. |
| Otherwise | Write to both localStorage keys. Fire-and-forget background sync to server. |

### 6.4 Batch Buffer Commit — `commitBatchBuffer()` — storageService.ts:385

Called by `endBatch()` when outermost batch exits:

1. Write player JSON to `ladder_ladder_players`
2. If not LOCAL mode, also write to `ladder_server_ladder_players`
3. If not LOCAL mode, call `dataService.savePlayers(batchBuffer)` (PUT to server) with 5-second timeout
4. Errors are silently ignored (fire-and-forget)

### 6.5 Batch API

| Function | Purpose |
|---|---|
| `startBatch()` | Load current localStorage data into buffer, increment counter |
| `endBatch()` | Decrement counter; when reaches 0, commit buffer and sync to server |
| `isInBatch()` | Return `batchOperationCount > 0` |
| `getCurrentPlayers()` | Return batchBuffer if active, else read from localStorage |

---

## 7. Server-Side — ladder.routes.ts

### 7.1 GET /api/ladder

Public read access. Returns `{ success: true, data: { header, players, playerCount } }`.

### 7.2 PUT /api/ladder (bulk update)

Requires auth (`requireUserKey` middleware). Accepts `{ players: PlayerData[] }`. Replaces entire players array in ladder.tab file. Creates backup before write.

### 7.3 PUT /api/ladder/:rank (single player)

Requires auth. Updates individual player fields (except rank). Creates backup before write.

### 7.4 DELETE /api/ladder/:rank/round/:roundIndex

Requires auth. Clears a single game result cell. Also updates localStorage cache.

### 7.5 Data Persistence

- Server reads/writes `data/ladder.tab` (configurable via `TAB_FILE_PATH` env var)
- Backups created in `data/backups/` before each write
- Max 20 backups, oldest rotated out automatically
- File lock mechanism prevents concurrent writes (simple mutex with wait queue)

### 7.6 Backup Naming

`ladder_backup_YYYYMMDD_HHMMSS.tab`

---

## 8. Key Data Flow Diagrams

### 8.1 Recalculate Flow (non-admin)

```
[Button Press]
    │
    ▼
startBatch() → batchOperationCount = 1, buffer = localStorage data
    │
    ▼
checkGameErrors(players)
    ├── parseEntry() for each cell → hash table validation
    ├── Dedup by normalized player key (intra-round + global)
    ├── Conflict detection (normalized result comparison)
    └── Returns { matches, errors }
    │
    ▼  (if errors > 0: show dialog, return — batch stays open)
    │
repopulateGameResults(players, matches)
    ├── Clear ALL gameResults to null
    ├── For each match: build normalized result string
    ├── Find lowest empty round per player
    └── Write result + "_" suffix
    │
    ▼
calculateRatings(processedPlayers, matches)
    ├── Snapshot effective ratings (abs(nRating > 0 ? nRating : rating))
    ├── Elo loop: update nRating = round(rating + K*(actual - expected))
    └── Post-loop: compute perfRating, blend if num_games < 10
    │
    ▼
setPlayers(calculatedPlayers) → React state update
    │
    ▼
savePlayers(calculatedPlayers) → batchBuffer = calculatedPlayers (no write yet)
    │
    ▼
endBatch() → batchOperationCount = 0 → commitBatchBuffer()
    ├── Write to localStorage (ladder_ladder_players + ladder_server_ladder_players)
    └── Fire-and-forget PUT to server
```

### 8.2 File Import Flow (admin mode)

```
[Load File Button]
    │
    ▼
fileInputRef.click() → FileReader.readAsText(file)
    │
    ▼
reader.onload: parse .tab content
    ├── Validate header Round 1 column = "1"
    ├── Parse each line into PlayerData (cols 0-12 + gameResults cols 13-43)
    ├── Empty ratings → default to 1
    ├── nRating from cols[5] (not hardcoded to 0)
    ├── Max 200 players
    ├── Remove ladder-specific localStorage keys ONLY
    └── Sort by current sortBy criteria
    │
    ▼
setPendingImport({ players, filename, playerCount, totalRoundsFilled, totalGamesPlayed })
    │
    ▼  [User sees confirmation dialog]
handleConfirmImport()
    ├── setPlayers(pendingImport.players)
    └── savePlayers(players, true) → waitForServer=true
        ├── PUT to server (blocks until response)
        ├── Mark all cells as saved on success
        └── Reset polling hash
```

### 8.3 New Day Flow

```
[New Day Button]
    │
    ▼
localStorage.setItem("ladder_pending_newday", JSON.stringify({ reRank, title }))
    │
    ▼  [User clicks Recalculate]
recalculateRatings() → detects pendingNewDayJson
    │
    ├── repopulateGameResults (clears + rebuilds)
    ├── calculateRatings (Elo loop + blending)
    │
    ▼
processNewDayTransformations(calculatedPlayers, reRank)
    ├── reRank=true: sort by nRating, reassign ranks
    └── Apply title progression (mini-game cycle)
    │
    ▼
savePlayers(finalPlayers) → server sync
    │
    ▼
localStorage.removeItem("ladder_pending_newday")
localStorage.removeItem("ladder_settings")  ← settings wiped on New Day!
    │
    ▼
setProjectNameStorage(nextTitle)
    │
    ▼
window.location.reload() → full page reload with new title
```

---

## 9. localStorage Keys

| Key | Purpose | Cleared By |
|---|---|---|
| `ladder_players` | Current player data (prefixed by getKeyPrefix()) | File import, New Day |
| `ladder_project_name` | Active ladder title / mini-game name | File import, New Day |
| `ladder_settings` | kFactor, performanceBlendingFactor, showRatings, debugLevel | New Day |
| `ladder_saved_cells` | Per-cell save status (underscore markers) | Recalculate, file import |
| `ladder_zoom_level` | Table zoom percentage | File import |
| `ladder_ladder_players` | Server-mode localStorage cache | File import, save, batch commit |
| `ladder_server_ladder_players` | Server-mode localStorage cache (preferred) | File import, save, batch commit |
| `bughouse-ladder-user-settings` | User's server URL + API key + debug mode | **Never** (was previously wiped by `localStorage.clear()`) |
| `bughouse-ladder-last-working-config` | Last known good server config | URL config reset (`?config=2`) |
| `ladder_pending_newday` | New Day operation pending flag | After processing on next recalc |

---

## 10. Known Issues / TODOs

### 10.1 nRating Clamping to 0 (hashUtils.ts:943-944)

```typescript
p1.nRating = Math.max(0, p1NewRating);
p2.nRating = Math.max(0, p2NewRating);
```

This clamps negative Elo adjustments to 0. The intended behavior per design is to allow negatives (indicating trophy ineligibility), clamped only at -9999. The perfRating calculation already handles negatives correctly; this Elo loop clamping is inconsistent.

### 10.2 Settings Wiped on New Day

`localStorage.removeItem("ladder_settings")` in both `recalculateRatings()` and `recalculateAndSave()` clears kFactor and performanceBlendingFactor when processing a New Day. This means users must re-enter these settings after every New Day operation.

### 10.3 Server URL Persistence After File Import

**FIXED (2026-04-23):** Previously `localStorage.clear()` in `loadPlayers()` wiped all localStorage including user settings. Now only ladder-specific keys are removed, preserving `bughouse-ladder-user-settings`.

### 10.4 Mode Detection Redundancy

`savePlayers()` checks both `dataService.getMode() === LOCAL` AND `!serverUrl`. This dual-check exists because mode detection is based on userSettings but the server URL can be set independently. The logic should be unified to avoid confusion.

---

## 11. Test Coverage

- 191 tests across 12 test files
- Tests cover: hashUtils (parseEntry, long2string, entry2string, processGameResults, calculateRatings), dataService (readLadderFile, writeLadderFile), LadderForm integration, storageService batch operations
- 2 skipped tests
