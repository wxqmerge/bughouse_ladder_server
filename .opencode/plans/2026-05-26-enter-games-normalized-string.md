# Enter Games Normalized String Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When entering a 4-player game result like `12:1LD3:4`, all 4 players should store the same normalized string (`1:12LD3:4_`), matching the behavior of `repopulateGameResults`.

**Architecture:** Add `normalizedString` field to `UpdatePlayerGameDataResult` computed in `updatePlayerGameData` using the same normalization logic as `buildNormalizedResult`. LadderForm uses this single string for all players instead of reconstructing separate strings per team/player.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add `normalizedString` to `UpdatePlayerGameDataResult`

**Files:**
- Modify: `shared/types/index.ts:76-88`
- Modify: `shared/utils/hashUtils.ts:1369-1438`

- [ ] **Step 1: Add `normalizedString` field to the type**

In `shared/types/index.ts`, add to `UpdatePlayerGameDataResult`:

```typescript
export interface UpdatePlayerGameDataResult {
  isValid: boolean;
  error?: number;
  message?: string;
  parsedPlayersList?: number[];
  parsedScoreList?: number[];
  originalString: string;
  resultString?: string;
  normalizedString?: string; // NEW: normalized result string with "_" suffix, same for all players
  parsedPlayer1Rank?: number;
  parsedPlayer2Rank?: number;
  parsedPlayer3Rank?: number;
  parsedPlayer4Rank?: number;
}
```

- [ ] **Step 2: Compute `normalizedString` in `updatePlayerGameData`**

In `shared/utils/hashUtils.ts`, in the success return block of `updatePlayerGameData` (around line 1427-1437), compute the normalized string before the return using the same logic as `buildNormalizedResult` (lines 1236-1281). The key insight: `parsedPlayersList[0-3]` are the ORIGINAL (pre-normalization) players, `parsedPlayersList[5-8]` are also originals. The normalization happens inside `parseEntry` but only affects `parsedPlayersList[0-3]` internally before computing the hash. We need to re-normalize using `normalize4Player`/`normalize2Player` on the original players.

```typescript
  // Build normalized result string (same for all players in the game)
  const normScore1Letter = scoreCodeToLetter(parsedScoreList[0]);
  let normalizedString: string;

  if (parsedPlayersList[2] > 0) {
    // 4-player game - use original players from parsedPlayersList[5-8]
    const origP1 = parsedPlayersList[5];
    const origP2 = parsedPlayersList[6];
    const origP3 = parsedPlayersList[7];
    const origP4 = parsedPlayersList[8];
    const norm = normalize4Player(origP1, origP2, origP3, origP4);
    const pair1Min = Math.min(origP1, origP2);
    const pair2Min = Math.min(origP3, origP4);
    const pairsSwapped = pair1Min > pair2Min;

    const ns1 = pairsSwapped && parsedScoreList[1] > 0 ? swapScore(parsedScoreList[1]) : parsedScoreList[0];
    const ns2 = pairsSwapped && parsedScoreList[0] > 0 ? swapScore(parsedScoreList[0]) : parsedScoreList[1];

    const s1Letter = scoreCodeToLetter(ns1);
    if (ns2 > 0) {
      const s2Letter = scoreCodeToLetter(ns2);
      normalizedString = `${norm[0]}:${norm[1]}${s1Letter}${s2Letter}${norm[2]}:${norm[3]}`;
    } else {
      normalizedString = `${norm[0]}:${norm[1]}${s1Letter}${norm[2]}:${norm[3]}`;
    }
  } else {
    // 2-player game
    const origP1 = parsedPlayersList[5];
    const origP2 = parsedPlayersList[6];
    const norm = normalize2Player(origP1, origP2);
    const swapped = origP1 > origP2;
    const ns1 = swapped ? swapScore(parsedScoreList[0]) : parsedScoreList[0];
    const s1Letter = scoreCodeToLetter(ns1);

    if (parsedScoreList[1] > 0) {
      const ns2 = swapped ? swapScore(parsedScoreList[1]) : parsedScoreList[1];
      const s2Letter = scoreCodeToLetter(ns2);
      normalizedString = `${norm[0]}${s1Letter}${s2Letter}${norm[1]}`;
    } else {
      normalizedString = `${norm[0]}${s1Letter}${norm[1]}`;
    }
  }

  const resultStringWithUnderscore = addUnderscore ? normalizedString + "_" : normalizedString;
```

Then in the return object, update both `resultString` and add `normalizedString`:

```typescript
  return {
    isValid: true,
    parsedPlayersList: parsedPlayersList,
    parsedScoreList: parsedScoreList,
    originalString: input,
    resultString: resultStringWithUnderscore,
    normalizedString: resultStringWithUnderscore,
    parsedPlayer1Rank,
    parsedPlayer2Rank,
    parsedPlayer3Rank,
    parsedPlayer4Rank,
  };
```

- [ ] **Step 3: Commit**

```bash
git add shared/types/index.ts shared/utils/hashUtils.ts
git commit -m "feat: add normalizedString to updatePlayerGameData matching repopulateGameResults format"
```

### Task 2: Write tests for `normalizedString`

**Files:**
- Modify: `src/test/unit/parseEntry.test.ts`

- [ ] **Step 1: Add tests for normalized string output**

Add a new describe block after the existing 4-player mixed outcomes tests:

```typescript
  describe('normalizedString', () => {
    it('should normalize "12:1LD3:4" to "1:12LD3:4_"', () => {
      const result = updatePlayerGameData('12:1LD3:4');
      expect(result.isValid).toBe(true);
      expect(result.normalizedString).toBe('1:12LD3:4_');
    });

    it('should normalize "12:1WD3:4" to "1:12WD3:4_"', () => {
      const result = updatePlayerGameData('12:1WD3:4');
      expect(result.isValid).toBe(true);
      expect(result.normalizedString).toBe('1:12WD3:4_');
    });

    it('should normalize "12:1DD3:4" to "1:12DD3:4_"', () => {
      const result = updatePlayerGameData('12:1DD3:4');
      expect(result.isValid).toBe(true);
      expect(result.normalizedString).toBe('1:12DD3:4_');
    });

    it('should normalize 2-player "12W13" (no swap)', () => {
      const result = updatePlayerGameData('12W13');
      expect(result.isValid).toBe(true);
      expect(result.normalizedString).toBe('12W13_');
    });

    it('should normalize 2-player "13W12" (swap players)', () => {
      const result = updatePlayerGameData('13W12');
      expect(result.isValid).toBe(true);
      // 13 > 12, swap -> score W(3)->L(1), result: "12L13_"
      expect(result.normalizedString).toBe('12L13_');
    });

    it('should omit underscore when addUnderscore=false', () => {
      const result = updatePlayerGameData('12:1LD3:4', false);
      expect(result.isValid).toBe(true);
      expect(result.normalizedString).toBe('1:12LD3:4');
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm run test:run -- src/test/unit/parseEntry.test.ts
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/test/unit/parseEntry.test.ts
git commit -m "test: add normalizedString tests for 4-player and 2-player entries"
```

### Task 3: Simplify LadderForm Enter Games to use `normalizedString`

**Files:**
- Modify: `src/components/LadderForm.tsx:1262-1349`

- [ ] **Step 1: Replace the 4-player and 2-player branches with unified normalized string logic**

Replace lines 1297-1349 with:

```typescript
      const normalizedResult = (parsedResult.normalizedString || parsedResult.resultString || correctedString).replace(/_$/, "").toUpperCase();
      const resultToStore = normalizedResult + "_";

      if (is4Player) {
        log('[ENTER_GAMES]', '4P OUTPUT: "' + resultToStore + '" (all 4 players)');
        fillCell(p1Rank, resultToStore);
        fillCell(p2Rank, resultToStore);
        fillCell(p3Rank, resultToStore);
        fillCell(p4Rank, resultToStore);
        addDelta({ type: 'GAME_RESULT', playerRank: p1Rank, round: roundIndex, result: resultToStore });
        addDelta({ type: 'GAME_RESULT', playerRank: p2Rank, round: roundIndex, result: resultToStore });
        addDelta({ type: 'GAME_RESULT', playerRank: p3Rank, round: roundIndex, result: resultToStore });
        addDelta({ type: 'GAME_RESULT', playerRank: p4Rank, round: roundIndex, result: resultToStore });
      } else {
        log('[ENTER_GAMES]', '2P OUTPUT: "' + resultToStore + '" (both players)');
        fillCell(p1Rank, resultToStore);
        fillCell(p2Rank, resultToStore);
        addDelta({ type: 'GAME_RESULT', playerRank: p1Rank, round: roundIndex, result: resultToStore });
        addDelta({ type: 'GAME_RESULT', playerRank: p2Rank, round: roundIndex, result: resultToStore });
      }
```

Also remove the now-unused `scoreToLetter`, `s1l`, `s2l` helper variables (lines 1276-1279), `swapScore` functions, and all the outcome computation variables. Keep the `PARSED` summary line and the `fillCell` helper.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Run all tests**

```bash
npm run test:run
```

Expected: all 742 tests PASS (736 + 6 new)

- [ ] **Step 4: Commit**

```bash
git add src/components/LadderForm.tsx
git commit -m "fix: Enter Games stores same normalized string for all players, matching repopulateGameResults"
```

---

## Verification

After all tasks complete:
1. `npm run typecheck` passes
2. `npm run test:run` passes (all tests)
3. Entering `12:1LD3:4` in cell P1 R1 results in:
   - P1 R1: `1:12LD3:4_`
   - P12 R1: `1:12LD3:4_`
   - P3 R1: `1:12LD3:4_`
   - P4 R1: `1:12LD3:4_`
