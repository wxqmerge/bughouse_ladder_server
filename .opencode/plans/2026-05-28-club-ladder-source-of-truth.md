# Club Ladder as Source of Truth for Player Identity

> **For agent workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee player identity data (name, rating, trophyEligible, etc.) stays consistent across club ladder and all mini-games by making the club ladder the single source of truth.

**Architecture:** Mini-game reads merge identity from club ladder. Mini-game saves split: identity changes route to club ladder, gameResults route to mini-game file. File format unchanged — identity override happens on read, not file migration.

**Tech Stack:** TypeScript, Express, React/Vite, existing shared types

---

## File Map
| File | Role |
|------|------|
| `shared/utils/identityMerge.ts` (new) | `mergeIdentityFromClubLadder()`, `splitIdentityChanges()` |
| `server/src/services/tournamentService.ts` | Server-side mini-game read/write, uses identity merge |
| `server/src/routes/ladder.routes.ts` | `GET /mini-games/read` and `POST /mini-games/write` endpoints |
| `src/services/dataService.ts` | Frontend mini-game load/save, applies identity merge for server mode |
| `src/services/storageService.ts` | `savePlayers()` — splits identity/gameResults for mini-game saves |
| `src/utils/mergeUtils.ts` | `mergeServerWithLocal()` — preserve local identity edits |
| `shared/types/index.ts` | No change — `PlayerData` interface unchanged |

---

## Chunk 1: Shared identity merge utility

### Task 1: Create identity merge utility

**Files:**
- Create: `shared/utils/identityMerge.ts`
- Modify: `shared/utils/hashUtils.ts` (re-export for convenience)

Identity fields: `rank`, `group`, `lastName`, `firstName`, `rating`, `nRating`, `trophyEligible`, `grade`, `num_games`, `attendance`, `phone`, `info`, `school`, `room`
Game fields: `gameResults` (31-element array)

- [ ] **Step 1: Create `shared/utils/identityMerge.ts` with `mergeIdentityFromClubLadder`**

```typescript
import { PlayerData } from '../types';

const IDENTITY_FIELDS = [
  'rank', 'group', 'lastName', 'firstName', 'rating', 'nRating',
  'trophyEligible', 'grade', 'num_games', 'attendance', 'phone', 'info', 'school', 'room'
] as const;

export type IdentityField = typeof IDENTITY_FIELDS[number];

export function isIdentityField(field: string): field is IdentityField {
  return IDENTITY_FIELDS.includes(field as IdentityField);
}

/**
 * For each mini-game player, replace identity fields with club ladder identity.
 * Game results are preserved from the mini-game file.
 * Players not found in club ladder keep their existing identity.
 */
export function mergeIdentityFromClubLadder(
  miniGamePlayers: PlayerData[],
  clubPlayers: PlayerData[]
): PlayerData[] {
  const clubByRank = new Map<number, PlayerData>();
  for (const p of clubPlayers) {
    clubByRank.set(p.rank, p);
  }

  return miniGamePlayers.map(mgPlayer => {
    const clubPlayer = clubByRank.get(mgPlayer.rank);
    if (!clubPlayer) {
      // Not in club ladder — keep as-is
      return mgPlayer;
    }

    // Build merged: club identity + mini-game gameResults
    const merged: PlayerData = { ...clubPlayer };
    merged.gameResults = mgPlayer.gameResults || clubPlayer.gameResults;
    return merged;
  });
}

/**
 * Given mini-game players as received from client and the last-known club ladder
 * snapshot, detect which players had identity changes. Returns:
 * - identityUpdates: players whose identity fields changed (to be written to club ladder)
 * - miniGamePlayers: all players with identity overridden from club ladder + original gameResults
 */
export function splitIdentityChanges(
  incomingPlayers: PlayerData[],
  clubSnapshot: PlayerData[]
): { identityUpdates: PlayerData[]; miniGamePlayers: PlayerData[] } {
  const clubByRank = new Map<number, PlayerData>();
  for (const p of clubSnapshot) {
    clubByRank.set(p.rank, p);
  }

  const identityUpdates: PlayerData[] = [];
  const miniGamePlayers: PlayerData[] = [];

  for (const incoming of incomingPlayers) {
    const clubPlayer = clubByRank.get(incoming.rank);

    if (!clubPlayer) {
      // New player not in club ladder — keep as-is in mini-game
      miniGamePlayers.push(incoming);
      continue;
    }

    // Check if any identity field changed
    let identityChanged = false;
    for (const field of IDENTITY_FIELDS) {
      if (field === 'rank') continue; // rank is the key, not compared
      if (incoming[field] !== clubPlayer[field]) {
        identityChanged = true;
        break;
      }
    }

    if (identityChanged) {
      // Route identity changes to club ladder (preserve club's gameResults)
      identityUpdates.push({ ...incoming });
    }

    // Mini-game gets club identity + incoming gameResults
    const merged: PlayerData = { ...clubPlayer };
    merged.gameResults = incoming.gameResults || clubPlayer.gameResults;
    miniGamePlayers.push(merged);
  }

  return { identityUpdates, miniGamePlayers };
}
```

- [ ] **Step 2: Write tests for identity merge utility**

Create `src/test/shared/identityMerge.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mergeIdentityFromClubLadder, splitIdentityChanges } from '../../../shared/utils/identityMerge';
import { PlayerData, DEFAULT_GAME_RESULTS } from '../../../shared/types';

function makePlayer(overrides: Partial<PlayerData> = {}): PlayerData {
  return {
    rank: 1,
    group: '',
    lastName: 'Smith',
    firstName: 'John',
    rating: 1200,
    nRating: 0,
    trophyEligible: true,
    grade: '',
    num_games: 0,
    attendance: 0,
    phone: '',
    info: '',
    school: '',
    room: '',
    gameResults: [...DEFAULT_GAME_RESULTS],
    ...overrides,
  };
}

describe('mergeIdentityFromClubLadder', () => {
  it('replaces identity from club ladder, preserves game results', () => {
    const mgPlayer = makePlayer({
      rank: 1,
      lastName: 'OldName',
      firstName: 'OldFirst',
      rating: 1000,
      gameResults: ['5W3L', null, '2W4L'],
    });
    const clubPlayer = makePlayer({
      rank: 1,
      lastName: 'NewName',
      firstName: 'NewFirst',
      rating: 1500,
      gameResults: ['9W1L'],
    });

    const result = mergeIdentityFromClubLadder([mgPlayer], [clubPlayer]);
    expect(result[0].lastName).toBe('NewName');
    expect(result[0].firstName).toBe('NewFirst');
    expect(result[0].rating).toBe(1500);
    expect(result[0].gameResults).toEqual(['5W3L', null, '2W4L']);
  });

  it('keeps mini-game identity when player not in club ladder', () => {
    const mgPlayer = makePlayer({ rank: 99, lastName: 'Unknown' });
    const result = mergeIdentityFromClubLadder([mgPlayer], []);
    expect(result[0].lastName).toBe('Unknown');
  });
});

describe('splitIdentityChanges', () => {
  it('detects identity changes and returns them separately', () => {
    const clubPlayer = makePlayer({ rank: 1, lastName: 'Smith', rating: 1200 });
    const incoming = makePlayer({
      rank: 1,
      lastName: 'Jones',
      rating: 1300,
      gameResults: ['5W3L'],
    });

    const { identityUpdates, miniGamePlayers } = splitIdentityChanges([incoming], [clubPlayer]);
    expect(identityUpdates.length).toBe(1);
    expect(identityUpdates[0].lastName).toBe('Jones');
    expect(miniGamePlayers[0].lastName).toBe('Smith');
    expect(miniGamePlayers[0].gameResults[0]).toBe('5W3L');
  });

  it('returns no identity updates when identity unchanged', () => {
    const player = makePlayer({ rank: 1, lastName: 'Smith', rating: 1200 });
    const incoming = makePlayer({
      rank: 1,
      lastName: 'Smith',
      rating: 1200,
      gameResults: ['5W3L'],
    });

    const { identityUpdates } = splitIdentityChanges([incoming], [player]);
    expect(identityUpdates.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm run test:run -- src/test/shared/identityMerge.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Re-export from hashUtils for convenience import**

In `shared/utils/hashUtils.ts`, add at the bottom:
```typescript
export { mergeIdentityFromClubLadder, splitIdentityChanges, isIdentityField } from './identityMerge.js';
```

- [ ] **Step 5: Compile shared and run full typecheck**

Run: `npm run test:run` (root) then verify no type errors in shared code.

- [ ] **Step 6: Commit**

```bash
git add shared/utils/identityMerge.ts src/test/shared/identityMerge.test.ts shared/utils/hashUtils.ts
git commit -m "feat: add identity merge utility for club ladder source of truth"
```

---

## Chunk 2: Server-side mini-game read/write with identity merge

### Task 2: Server merge identity on mini-game read

**Files:**
- Modify: `server/src/routes/ladder.routes.ts` (GET `/mini-games/read`)
- Modify: `server/src/services/tournamentService.ts` (add `readMiniGameWithIdentity` helper)

- [ ] **Step 1: Add `readMiniGameWithIdentity` to tournamentService.ts**

In `server/src/services/tournamentService.ts`, after `writeMiniGameFile`:

```typescript
import { mergeIdentityFromClubLadder } from '../../../shared/utils/identityMerge.js';

export async function readMiniGameWithIdentity(fileName: string): Promise<LadderData | null> {
  const miniGameData = await readMiniGameFile(fileName);
  if (!miniGameData) return null;

  const clubLadder = await readLadderFile();
  const mergedPlayers = mergeIdentityFromClubLadder(miniGameData.players, clubLadder.players);

  return {
    header: miniGameData.header,
    players: mergedPlayers,
    rawLines: miniGameData.rawLines,
  };
}
```

- [ ] **Step 2: Update `GET /mini-games/read` endpoint**

In `server/src/routes/ladder.routes.ts`, import `readMiniGameWithIdentity` from tournamentService. Replace the read endpoint (line 306-346):

```typescript
router.get('/mini-games/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName } = req.query;

    if (!fileName || !MINI_GAME_FILES.includes(fileName as string)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid mini-game file name' },
      });
      return;
    }

    const miniGameData = await readMiniGameWithIdentity(fileName as string);
    if (!miniGameData) {
      res.json({
        success: true,
        data: {
          header: [],
          players: [],
          playerCount: 0,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        header: miniGameData.header,
        players: miniGameData.players,
        playerCount: miniGameData.players.length,
      },
    });
  } catch (error) {
    logError('[SERVER]', 'Error reading mini-game file:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to read mini-game file' },
    });
  }
});
```

- [ ] **Step 3: Update `POST /mini-games/write` endpoint with identity split**

Replace the write endpoint (line 349-388):

```typescript
import { splitIdentityChanges } from '../../../shared/utils/identityMerge.js';
import { readLadderFile } from '../services/dataService.js';

router.post('/mini-games/write', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName, players } = req.body;

    if (!fileName || !MINI_GAME_FILES.includes(fileName)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid mini-game file name' },
      });
      return;
    }

    if (!players || !Array.isArray(players)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid players data' },
      });
      return;
    }

    // Get current club ladder snapshot
    const clubLadder = await readLadderFile();

    // Split: identity changes go to club ladder, gameResults stay in mini-game
    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(players, clubLadder.players);

    // Write identity updates to club ladder
    if (identityUpdates.length > 0) {
      const updatedClubPlayers = clubLadder.players.map(cp => {
        const update = identityUpdates.find(iu => iu.rank === cp.rank);
        return update ? { ...cp, ...update } : cp;
      });
      await writeLadderFile({
        header: clubLadder.header,
        players: updatedClubPlayers,
        rawLines: clubLadder.rawLines,
      });
      loggerLog('[SERVER]', `Updated ${identityUpdates.length} player identities in club ladder`);
    }

    // Write mini-game with club identity + gameResults
    await writeMiniGameFile(fileName, {
      header: [],
      players: miniGamePlayers,
      rawLines: [],
    });

    broadcastSSEEvent('miniGameWritten', { fileName, type: 'miniGameWrite' });

    if (identityUpdates.length > 0) {
      broadcastSSEEvent('ladderUpdated', { type: 'ladderUpdate' });
    }

    res.json({
      success: true,
      data: { message: `Saved ${fileName}`, identityUpdates: identityUpdates.length },
    });
  } catch (error) {
    logError('[SERVER]', 'Error writing mini-game file:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to write mini-game file' },
    });
  }
});
```

- [ ] **Step 4: Run server typecheck**

Run: `npm run typecheck` (in server/)
Expected: No type errors

- [ ] **Step 5: Run server tests**

Run: `npm run test:run` (in server/)
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/ladder.routes.ts server/src/services/tournamentService.ts
git commit -m "feat: server-side identity merge for mini-game read/write"
```

---

## Chunk 3: Frontend local mode identity merge

### Task 3: Frontend local mode — merge identity on mini-game load

**Files:**
- Modify: `src/services/dataService.ts` (`getLocalMiniGamePlayers`, `saveLocalMiniGamePlayers`)
- Modify: `src/services/storageService.ts` (`savePlayers` mini-game path)

- [ ] **Step 1: Import identity merge in dataService.ts**

Add import:
```typescript
import { mergeIdentityFromClubLadder, splitIdentityChanges } from '../../shared/utils/identityMerge';
```

- [ ] **Step 2: Merge identity in `getLocalMiniGamePlayers`**

Replace `getLocalMiniGamePlayers` (line 519-524):

```typescript
private async getLocalMiniGamePlayers(): Promise<PlayerData[]> {
  if (!this.currentMiniGameFile) return [];
  const store = this.getStore();
  const miniGameData = await store.readMiniGameFile(this.currentMiniGameFile);
  if (!miniGameData) return [];

  // Merge identity from local club ladder
  const clubPlayers = await this.getLocalPlayers();
  return mergeIdentityFromClubLadder(miniGameData.players, clubPlayers);
}
```

- [ ] **Step 3: Split identity in `saveLocalMiniGamePlayers`**

Replace `saveLocalMiniGamePlayers` (line 526-537):

```typescript
private saveLocalMiniGamePlayers(players: PlayerData[], notify: boolean = true): void {
  if (!this.currentMiniGameFile) return;

  // Get club ladder snapshot for identity split
  const clubPlayers = this.getLocalPlayersSync();
  const { identityUpdates, miniGamePlayers } = splitIdentityChanges(players, clubPlayers);

  // Update club ladder with identity changes
  if (identityUpdates.length > 0) {
    const updatedClubPlayers = clubPlayers.map(cp => {
      const update = identityUpdates.find(iu => iu.rank === cp.rank);
      return update ? { ...cp, ...update } : cp;
    });
    this.saveLocalPlayers(updatedClubPlayers, false);
  }

  // Save mini-game with club identity + gameResults
  const store = this.getStore();
  store.writeMiniGameFile(this.currentMiniGameFile, {
    header: [],
    players: miniGamePlayers,
    rawLines: [],
  });
  if (notify) {
    this.notifySubscribers();
  }
}
```

- [ ] **Step 4: Add `getLocalPlayersSync` helper**

Add a synchronous getter to access the localStorage players cache (needed for the split operation which runs synchronously in `saveLocalMiniGamePlayers`). If `getLocalPlayers` returns a Promise, we need a sync alternative:

Check `getLocalPlayers` — if it's async, add:
```typescript
private getLocalPlayersSync(): PlayerData[] {
  const stored = getJson<PlayerData[]>('ladder_players');
  return stored || [];
}
```

Import `getJson` from storageService if not already imported.

- [ ] **Step 5: Update `savePlayers` in storageService.ts for mini-game path**

In `src/services/storageService.ts`, the mini-game save path (line 412-444) already sends full player data to the server. For LOCAL mode, the split happens in `dataService.saveLocalMiniGamePlayers`. For SERVER mode, the split happens server-side. No frontend change needed for `storageService.savePlayers` — the server handles it.

Verify the flow: `storageService.savePlayers` → for mini-game, sends to `/mini-games/write` → server splits identity. This is correct.

- [ ] **Step 6: Run frontend typecheck**

Run: `npm run typecheck` (root)
Expected: No type errors

- [ ] **Step 7: Run frontend tests**

Run: `npm run test:run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/services/dataService.ts
git commit -m "feat: frontend local mode identity merge for mini-games"
```

---

## Chunk 4: Fix mergeServerWithLocal to preserve identity edits

### Task 4: Preserve local identity edits during server merge

**Files:**
- Modify: `src/utils/mergeUtils.ts`

Current behavior: merges `nRating` and `trophyEligible` from local, but discards other identity fields (name, rating, etc.) — replaces them with server version.

With club ladder as source of truth, identity should come from the server (club ladder). BUT for mini-game views, the user may edit identity locally before saving — those edits should be preserved until save.

The fix: preserve ALL local identity fields during merge, not just `nRating` and `trophyEligible`.

- [ ] **Step 1: Update mergeServerWithLocal to preserve all local identity fields**

In `src/utils/mergeUtils.ts`, replace the return statement in the merge loop (line 56-61):

```typescript
const IDENTITY_FIELDS = [
  'group', 'lastName', 'firstName', 'rating', 'nRating',
  'trophyEligible', 'grade', 'num_games', 'attendance', 'phone', 'info', 'school', 'room'
] as const;

// ... in the merge loop, replace the return:
const merged: PlayerData = { ...sp, gameResults: mergedGameResults };
for (const field of IDENTITY_FIELDS) {
  if (localPlayer[field] !== undefined) {
    (merged as any)[field] = localPlayer[field];
  }
}
return merged;
```

- [ ] **Step 2: Run tests**

Run: `npm run test:run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/mergeUtils.ts
git commit -m "fix: preserve all local identity edits during server merge"
```

---

## Chunk 5: Version bump & verification

### Task 5: Bump version and verify

- [ ] **Step 1: Compile shared code**

Run: `node scripts/compile-shared.js`

- [ ] **Step 2: Bump version**

Update `package.json` and `server/package.json` version to `1.3.4`

- [ ] **Step 3: Run full typecheck**

Run: `npm run typecheck` (root) and `npm run typecheck` (server/)
Expected: Both pass

- [ ] **Step 4: Run full test suite**

Run: `npm run test:run` (root) and `npm run test:run` (server/)
Expected: All tests pass

- [ ] **Step 5: Build frontend**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Build server**

Run: `npm run build` (in server/)
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add package.json server/package.json
git commit -m "feat: club ladder as source of truth for player identity"
```

---

## Summary

| Change | Where | Effect |
|--------|-------|--------|
| `mergeIdentityFromClubLadder` | shared utility | Mini-game read gets club identity |
| `splitIdentityChanges` | shared utility | Mini-game save routes identity to club |
| Server read endpoint | `ladder.routes.ts` | Returns merged identity |
| Server write endpoint | `ladder.routes.ts` | Splits identity → club, gameResults → mini-game |
| Frontend local load | `dataService.ts` | Merges identity from local club ladder |
| Frontend local save | `dataService.ts` | Splits identity to local club ladder |
| Merge preservation | `mergeUtils.ts` | Local identity edits survive server sync |

**Edge cases handled:**
- Player in mini-game but not club ladder → keeps existing identity
- Player added to club ladder → reflected in mini-game on next read
- Identity edited in mini-game → saved to club ladder automatically
- Local mode → same logic against localStorage club ladder
