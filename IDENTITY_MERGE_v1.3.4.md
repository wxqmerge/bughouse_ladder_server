# Club Ladder Source of Truth — Identity Merge

## Goal
Guarantee player identity consistency across club ladder and all mini-games by making the club ladder the single source of truth.

## Design
- **Read**: mini-game view overrides identity from club ladder (no file migration needed)
- **Save**: auto-detect identity changes, split them — identity to club ladder, gameResults to mini-game file
- **File format**: unchanged — identity override happens on read only
- Players not in club ladder keep existing mini-game identity

## Shared Utilities — `shared/utils/identityMerge.ts`

### `IDENTITY_FIELDS`
Const array of 14 fields: rank, group, lastName, firstName, rating, nRating, trophyEligible, grade, num_games, attendance, phone, info, school, room.

### `mergeIdentityFromClubLadder(miniGamePlayers, clubPlayers)`
For each mini-game player, replaces all identity fields from club ladder match by rank. Preserves `gameResults` from mini-game. Players not found in club ladder keep existing identity.

### `splitIdentityChanges(incomingPlayers, clubSnapshot)`
Compares incoming players against club ladder snapshot. Returns:
- `identityUpdates`: players whose identity fields changed (write to club ladder)
- `miniGamePlayers`: all players with club identity + original gameResults (write to mini-game file)

### `isIdentityField(field)`
Type guard for IdentityField.

## Server Changes

### `GET /mini-games/read` (ladder.routes.ts)
Calls `readMiniGameWithIdentity()` instead of `readMiniGameFile()` — merges club ladder identity before returning.

### `POST /mini-games/write` (ladder.routes.ts)
1. Reads current club ladder snapshot
2. Calls `splitIdentityChanges(players, clubLadder.players)`
3. Writes identity updates to club ladder (broadcasts SSE `ladderUpdated`)
4. Writes mini-game file with club identity + gameResults
5. Broadcasts SSE `miniGameWritten`

### `readMiniGameWithIdentity()` (tournamentService.ts)
New helper: reads mini-game file, reads club ladder, calls `mergeIdentityFromClubLadder`, returns merged result.

### `server/src/services/dataService.ts`
Removed local `PlayerData` interface duplicate. Now imports from `shared/types/index.js`.

## Frontend Changes

### `dataService.ts` (LOCAL mode)
- `getLocalMiniGamePlayers()`: reads mini-game file, reads club players from localStorage, merges identity
- `saveLocalMiniGamePlayers()`: calls `splitIdentityChanges`, writes identity updates to `ladder_players` in localStorage, writes gameResults to mini-game store

### `mergeServerWithLocal` (mergeUtils.ts)
Preserves all local identity fields during server merge. Iterates over shared `IDENTITY_FIELDS` array.

### `RestoreBackupDialog.tsx`
Removed local `PlayerData` interface. Now imports from `shared/types`.

### `hashUtils.ts`
Re-exports `mergeIdentityFromClubLadder` and `splitIdentityChanges` for convenience import.

## Tests
7 new tests in `src/test/shared/identityMerge.test.ts`:
- mergeIdentityFromClubLadder: replaces identity, preserves game results, handles missing club players, mixed club/non-club
- splitIdentityChanges: detects identity changes, returns empty for unchanged, handles missing club snapshot, game-only changes don't trigger identity update

## Key Decisions
- Club ladder as source of truth (not separate registry or enhanced propagation)
- Auto-detect and split on save — user edits freely, identity changes route transparently
- Override on read only — backward compatible with existing .tab files
- `IDENTITY_FIELDS` exported from shared for use in `mergeUtils.ts`
- `saveLocalMiniGamePlayers` changed to async because `storageGetPlayers()` returns a Promise
- `mergeServerWithLocal` uses explicit iteration over `IDENTITY_FIELDS` to avoid TS index signature errors

## New Day Observation
`processNewDayTransformations` (shared/utils/constants.ts:69) increments `num_games` per player by games played that day:
```
num_games: (player.num_games || 0) + gameCount
```
With identity merge, `num_games` propagates to club ladder on save, then merges back on next file read. Across a tournament week (7 files, one per day), `num_games` accumulates correctly because:
1. Day 1: player plays 3 games → num_games += 3 → saved to club ladder
2. Day 2: new file read merges num_games from club ladder → player plays 2 games → num_games += 2 → saved to club ladder
3. Total: num_games correctly reflects cumulative games across all files

## Reverted 2026-05-28
Identity merge was reverted to investigate New Day logic independently. All code is preserved in this file for re-implementation later.
