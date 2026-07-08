# Execution Trace: Enter_Recalculate_Save → Display

## Entry Point

```
ErrorDialog.tsx:521  handleEnterRecalculateSave(e)
  └─ ErrorDialog.tsx:528  onEnterRecalculateSave(value)
      └─ LadderForm.tsx:1521  handleEnterRecalculateSave(correctedString)
```

---

## Phase 1: Parse & Fill Cells (LadderForm.tsx:1521-1686)

```
1521: handleEnterRecalculateSave(correctedString)
  │
  ├─ 1522: if (!entryCell) return;                    // EARLY EXIT - no log
  │
  ├─ 1524-1525: log active file + entered string      // ✅ LOG: log() → console.debug with timestamp
  ├─ 1526: console.debug entry cell info               // ✅ LOG
  │
  ├─ 1529-1531: isServerDownMode() → markLocalChanges() // ✅ LOG inside markLocalChanges (storageService.ts:154)
  │
  ├─ 1534-1537: updatePlayerGameData(correctedString)   // Parse game result
  │   └─ shared/utils/hashUtils.ts:1425
  │       ├─ 1429: shouldLogDebug(3) entry log          // ✅ LOG at level 3
  │       ├─ 1454: console.log on invalid format        // ✅ LOG (console.log, always fires)
  │       └─ 1511: shouldLogDebug(3) exit log           // ✅ LOG at level 3
  │
  ├─ 1539: if (parsedResult.isValid) {                 // MAIN BRANCH - valid parse
  │   │
  │   ├─ 1549-1550: build normalizedResult + "_" suffix
  │   ├─ 1552: log 4P/2P output                        // ✅ LOG
  │   │
  │   ├─ 1555-1587: Override mode - clear old matching cells
  │   │   ├─ 1560: log old cell value                   // ✅ LOG
  │   │   ├─ 1584: setPlayers(updatedPlayers)           // React state update
  │   │   └─ 1585: log cleared count                    // ✅ LOG
  │   │
  │   ├─ 1589-1635: Validate player references exist
  │   │   └─ 1593-1634: MISSING RANKS → EARLY RETURN
  │   │       ├─ 1594: log invalid players              // ✅ LOG
  │   │       ├─ 1596-1599: processGameResults + setPending*
  │   │       ├─ 1600-1632: set current/walkthrough errors
  │   │       ├─ 1633: setIsRecalculating(true)
  │   │       └─ 1634: return                           // ⚠️ EXIT - data NOT saved, error shown
  │   │
  │   ├─ 1638-1659: fillCell helper (immutable update)
  │   │   ├─ 1645: log overwrite (override mode)        // ✅ LOG
  │   │   ├─ 1650: log filled cell                      // ✅ LOG
  │   │   └─ 1652-1654: shouldLog(3) skipped cell       // ✅ LOG at level 3
  │   │
  │   ├─ 1663-1677: fill cells for 2P or 4P + addDelta
  │   │   └─ addDelta() → storageService.ts:238
  │   │       └─ 239-242: queue full → console.error    // ✅ LOG (always fires)
  │   │
  │   ├─ 1683: playersRef.current = updatedPlayers      // SYNC ref update
  │   ├─ 1684: console.debug updatedPlayers debug        // ✅ LOG
  │   └─ 1685: setPlayers(updatedPlayers)               // React state update
  │
  └─ 1539: if (!parsedResult.isValid) → SKIP            // ⚠️ NO LOG if parse fails
      └─ Falls through to recalculateAndSave with unfilled cells
```

### ⚠️ DATA LOSS RISK #1: Invalid parse at line 1539
If `parsedResult.isValid === false`, the entire block from 1539-1686 is skipped. No cells are filled, but the function continues to `recalculateAndSave()`. There is **no console output** at debug_level<=5 to indicate that the parse failed and cells were skipped. The only log is `console.log` at hashUtils.ts:1454 which fires unconditionally (not gated by debug level).

**Verdict:** `console.log` at hashUtils.ts:1454 always fires, so this IS visible. No additional log needed.

---

## Phase 2: RecalculateAndSave (LadderForm.tsx:1978-2346)

```
1695: const hadErrors = await recalculateAndSave()
  │
  ├─ 1979: log 'Starting recalculate_and_save'         // ✅ LOG
  │
  ├─ 1982-2000: Pending New Day operation
  │   ├─ 1984-1986: console.debug pending data          // ✅ LOG
  │   └─ 1997: console.error on failure                 // ✅ LOG
  │
  ├─ 2003: if (isAdmin) {                              // ADMIN MODE PATH
  │   │
  │   ├─ 2004: log Admin mode                          // ✅ LOG
  │   ├─ 2007: clearAllSaveStatus()
  │   │
  │   ├─ 2012: mergePlayers = playersRef.current
  │   │
  │   ├─ 2014-2090: Server fetch + merge (if serverUrl)
  │   │   ├─ 2033-2034: alert + return true (>4 diverged)  // ⚠️ EXIT - data NOT saved
  │   │   ├─ 2040-2041: alert + return true (dup ranks)     // ⚠️ EXIT - data NOT saved
  │   │   ├─ 2043-2044: confirm + return true (user cancel) // ⚠️ EXIT - data NOT saved
  │   │   ├─ 2050-2082: merge logic (cell-by-cell priority)
  │   │   │   └─ 2080: log dedup count                  // ✅ LOG
  │   │   │   └─ 2083: log merged count                 // ✅ LOG
  │   │   ├─ 2085: log fetch fail → use local           // ✅ LOG
  │   │   └─ 2088: log fetch error                      // ✅ LOG
  │   │
  │   ├─ 2093: checkGameErrorsWithPlayers(mergePlayers)
  │   │   └─ LadderForm.tsx:1386
  │   │       ├─ 1397: console.error no players          // ✅ LOG
  │   │       ├─ 1406-1408: shouldLog(4) validation info // ✅ LOG at level 4
  │   │       ├─ 1412: console.warn rank warnings        // ✅ LOG (always)
  │   │       └─ 1415: console.warn game errors          // ✅ LOG (always)
  │   │
  │   ├─ 2096-2099: rank blocking errors → return true   // ⚠️ EXIT - alert shown
  │   │   └─ 2097: console.debug rank errors              // ✅ LOG (unconditional)
  │   │
  │   ├─ 2103-2110: game errors → return true
  │   │   └─ 2104-2108: shouldLog(5) error count         // ✅ LOG at level 5
  │   │
  │   ├─ 2117-2126: shouldLog(3) match/stats info        // ✅ LOG at level 3
  │   ├─ 2128-2130: shouldLog(2) repopulate info         // ✅ LOG at level 2
  │   │
  │   ├─ 2131-2136: repopulateGameResults()
  │   │   └─ hashUtils.ts:1272
  │   │       └─ 1306-1317: shouldLogDebug(2) per match  // ✅ LOG at level 2
  │   │
  │   ├─ 2138-2145: shouldLog(3) repop stats             // ✅ LOG at level 3
  │   │
  │   ├─ 2147-2151: shouldLog(3) admin recalc start      // ✅ LOG at level 3
  │   │
  │   ├─ 2153: calculateRatings()                        // Rating calculation
  │   │   └─ hashUtils.ts:1124
  │   │       └─ calculateRatingsSinglePass():855
  │   │           └─ DebugLogger (enabled by debugMode flag, NOT debugLevel)
  │   │
  │   ├─ 2154: normalizePlayersAttendance + Trophy
  │   │
  │   ├─ 2156-2164: shouldLog(3) after calc debug        // ✅ LOG at level 3
  │   │
  │   ├─ 2167: lockAndDeduplicate()
  │   │   └─ dedupUtils.ts:117
  │   │       └─ adds "_" suffix, deduplicates            // No log
  │   │
  │   ├─ 2169-2177: shouldLog(3) locked debug            // ✅ LOG at level 3
  │   ├─ 2178-2180: shouldLog(3) recalc end              // ✅ LOG at level 3
  │   │
  │   ├─ 2184-2198: savePlayers(dedupedAdminPlayers, true)
  │   │   └─ storageService.ts:394
  │   │       └─ See Phase 3 (savePlayers analysis)
  │   │
  │   ├─ 2200: setPlayers(dedupedAdminPlayers)           // React state → display
  │   ├─ 2201: log complete                              // ✅ LOG
  │   └─ 2203: return false
  │
  └─ 2206: else {                                        // USER MODE PATH
      │
      ├─ 2207: log User mode                            // ✅ LOG
      ├─ 2209: clearAllSaveStatus()
      │
      ├─ 2212: checkGameErrorsWithPlayers(playersRef.current)
      │   └─ Same as admin path above
      │
      ├─ 2214-2218: rank blocking → return true
      │   └─ 2215-2217: shouldLog(5)                    // ✅ LOG at level 5
      │
      ├─ 2222-2227: game errors → return true
      │   └─ 2223-2225: shouldLog(5)                    // ✅ LOG at level 5
      │
      ├─ 2233-2242: shouldLog(3) match info             // ✅ LOG at level 3
      ├─ 2238-2246: shouldLog(2/3) repop info           // ✅ LOG at level 2/3
      │
      ├─ 2247: repopulateGameResults(playersRef.current)
      │   └─ Same as admin path
      │
      ├─ 2249-2257: shouldLog(3) repop debug            // ✅ LOG at level 3
      ├─ 2259: calculateRatings()
      ├─ 2260: normalizePlayersAttendance + Trophy
      ├─ 2262-2270: shouldLog(3) calc debug             // ✅ LOG at level 3
      │
      ├─ 2273: lockAndDeduplicate()
      ├─ 2275-2286: shouldLog(3) locked + end           // ✅ LOG at level 3
      │
      ├─ 2289: console.debug save debug                  // ✅ LOG (unconditional)
      │
      ├─ 2294: savePlayers(dedupedPlayers, true)
      │   └─ storageService.ts:394
      │       └─ See Phase 3
      │
      ├─ 2295-2299: save failure → alert + return false
      │   └─ 2296: log server reject                     // ✅ LOG
      │
      ├─ 2301-2302: clearLocalChangesFlag + pending deletes
      │
      ├─ 2304-2341: Pull fresh data from server
      │   ├─ 2305: log pulling                           // ✅ LOG
      │   ├─ 2312-2318: mini-game or main ladder fetch
      │   ├─ 2321: console.debug server return           // ✅ LOG (unconditional)
      │   ├─ 2327: console.debug setting players         // ✅ LOG (unconditional)
      │   ├─ 2328: setPlayers(finalPlayers)              // React state → display
      │   ├─ 2329: log synced                            // ✅ LOG
      │   ├─ 2331-2332: no pull data → setPlayers(normalized) // ✅ LOG
      │   ├─ 2335-2336: no server URL → setPlayers(normalized) // ✅ LOG
      │   └─ 2338-2340: catch → setPlayers(normalized)   // ✅ LOG
      │
      ├─ 2343: log complete                              // ✅ LOG
      └─ 2345: return false
```

### ⚠️ DATA LOSS RISK #2: Admin mode early exits (lines 2033, 2041, 2044)
Three alert/confirm paths return `true` (errors) without saving. The entered cells were already committed to state at line 1685, but the recalculation and server save are aborted. The local state still has the new cells (without `_` suffix), and they persist in `players` state until the next save.

**Verdict:** Data is NOT lost — it remains in React state. The user sees the new values in the UI. However, these are not persisted to localStorage or server. The `log()` calls at lines 2085/2088 cover the fetch failure paths, but the alert/confirm paths (2033, 2041, 2044) have no explicit `log()` or `console.debug()` at debug_level<=5 — only `alert()`/`confirm()` dialogs.

**MISSING LOG:** Lines 2032-2034, 2039-2041, 2043-2044 — no F12 log before the alert/return.

### ⚠️ DATA LOSS RISK #3: repopulateGameResults resets gameResults array
At hashUtils.ts:1278-1281, `repopulateGameResults` creates a fresh array of `null` for each player's `gameResults`, then fills from matches. If a cell was filled in Phase 1 but doesn't appear in the matches (e.g., it was entered but the match wasn't valid), it would be lost.

However, this is by design — `processGameResults` extracts matches from ALL players' gameResults, so any valid entry in Phase 1 would be picked up. The risk is only if the Phase 1 entry is invalid but `parsedResult.isValid` was true (parsing succeeded but the match has conflicting data).

**Verdict:** No loss in normal flow. The `shouldLog(3)` at LadderForm.tsx:2249-2257 logs all repopulated results per player, which allows verification at debug_level<=5.

---

## Phase 3: savePlayers (storageService.ts:394-477)

```
394: savePlayers(players, waitForServer, skipServerSync)
  │
  ├─ 395: isInBatch() → buffer + return                 // No log
  │
  ├─ 405-437: Mini-game mode
  │   ├─ 407: setJson (localStorage)                    // No log
  │   ├─ 408-422: waitForServer → POST mini-games/write
  │   │   └─ 418-421: 401/403 error message             // No log, returns error
  │   ├─ 422-423: skipServerSync → return
  │   └─ 424-436: fire-and-forget POST                  // No log on failure
  │
  ├─ 439-448: LOCAL mode (no server URL)
  │   ├─ 440: setJson (localStorage)                    // No log
  │   ├─ 441-446: markCellAsSaved per cell              // No log
  │   └─ 448: return success
  │
  └─ 449-476: SERVER mode
      ├─ 450: setJson (localStorage)                    // No log (always saves locally first)
      │
      ├─ 451-463: waitForServer → PUT /api/ladder
      │   ├─ 455-457: success → resetHash + return
      │   └─ 459-463: failure → 401/403 message         // No log, returns error
      │
      ├─ 464-465: skipServerSync → return
      │
      └─ 466-475: fire-and-forget PUT
          └─ 470-471: success → resetHash               // No log on failure
```

### ⚠️ DATA LOSS RISK #4: savePlayers has no logging at debug_level<=5
The `savePlayers` function performs critical persistence (localStorage + server) but has **zero** `console.debug()` or `log()` calls. If the server PUT fails silently (fire-and-forget path, lines 466-475), there's no F12 log to indicate the failure. The localStorage save at line 450 still succeeds, so data isn't truly lost, but the server sync failure is invisible.

Similarly, the mini-game fire-and-forget POST at lines 424-436 has no error logging.

**MISSING LOG:** `savePlayers` should log at debug_level<=5:
- Mode selection (LOCAL/SERVER/mini-game)
- localStorage save success
- Server request success/failure
- Fire-and-forget path taken

### ⚠️ DATA LOSS RISK #5: setJson (localStorage) can silently fail
`setJson` at line 407/440/450 wraps `localStorage.setItem`. If localStorage is full or unavailable, the operation silently fails. There's no try/catch in `savePlayers`.

**Verdict:** The `beforeunload` handler at LadderForm.tsx:449-463 has a try/catch, but `savePlayers` does not. A localStorage quota exceeded error during `savePlayers` would be silently swallowed.

---

## Phase 4: Post-Recalculate Flow (LadderForm.tsx:1698-1726)

```
1698: if (hadErrors) {                                  // recalculateAndSave returned true
  1699:   log errors found                              // ✅ LOG
  1702:   setEnterGamesError(null)
  1703:   console.debug waiting for correction          // ✅ LOG
  1704:   return                                        // EXIT - ErrorDialog shows errors
  }
  │
  1708: setIsRecalculating(false)                       // Switch ErrorDialog back to enter-games mode
  1711: findNextEmptyCell()
  │
  1713: if (nextCell) {
  1714:   log next cell                                 // ✅ LOG
  1715:   setEntryCell(nextCell)                        // Update dialog to next cell
  1716:   setTempGameResult(null)
  } else {
  1718:   log no more cells                             // ✅ LOG
  1719:   setIsEnterGamesMode(false)                    // Exit Enter Games mode
  1720:   setEntryCell(null)
  1721:   setTempGameResult(null)
  }
  │
  1724: setEnterGamesError(null)
  1725: setIsEnterGamesOverride(false)
  1726: console.debug complete                          // ✅ LOG
```

---

## Phase 5: Display Update (React Render Cycle)

```
setPlayers() → React re-render
  │
  ├─ useEffect (LadderForm.tsx:404-405): playersRef = players  // Sync ref
  ├─ useEffect (LadderForm.tsx:417-432): re-apply sortBy       // Sort if active
  ├─ useEffect (LadderForm.tsx:435-446): render perf measure   // ✅ LOG if >16ms
  ├─ useEffect (LadderForm.tsx:449-463): beforeunload save     // localStorage backup
  │
  └─ LadderTable re-renders with updated gameResults and nRatings
      └─ getCellDisplayValue() adds "_" suffix for saved cells
```

---

## Delta Queue (Background, storageService.ts:238-267)

```
addDelta() → pushes to deltaQueue (max 500)
  └─ flushDeltas() every 5s
      ├─ 240: console.error queue full                     // ✅ LOG (always)
      ├─ 248-250: console.error max failures exceeded       // ✅ LOG (always)
      ├─ 255: submitDeltaBatch (non-LOCAL mode only)
      └─ 261: console.error flush failure                   // ✅ LOG (always)
```

The delta queue is a **supplementary** sync mechanism. During `recalculateAndSave`, the full table is pushed via `savePlayers`, so the delta queue is not the primary persistence path. However, deltas added at lines 1668-1676 during cell filling are queued but may be redundant after the full save.

---

## Summary: Missing Logs at debug_level<=5 (FIXED)

| # | Location | Issue | Severity | Status |
|---|----------|-------|----------|--------|
| 1 | **storageService.ts:394-477** (`savePlayers`) | **No logging at all** — mode selection, localStorage save, server success/failure, fire-and-forget path all silent | **HIGH** | **FIXED** — added `shouldLog(5)` at every branch point + try/catch on fire-and-forget |
| 2 | **LadderForm.tsx:2032-2044** (admin sanity check exits) | alert/confirm before return, but no F12 log of which condition triggered | **MEDIUM** | **FIXED** — added `shouldLog(5)` before all 3 abort paths with reason |
| 3 | **storageService.ts:407/440/450** (`setJson`) | localStorage write can silently fail (quota, unavailable) — no try/catch | **MEDIUM** | **ALREADY COVERED** — `setJson` at storageService.ts:49-54 has try/catch with `log()` on failure |
| 4 | **LadderForm.tsx:1539** (invalid parse) | Falls through to recalculateAndSave with unfilled cells; no gated log | **LOW** | **FIXED** — added `shouldLog(5)` else branch with error code from parsedResult |
| 5 | **dedupUtils.ts:117** (`lockAndDeduplicate`) | Dedup operation is silent — if players are removed, no log indicates which | **LOW** | **FIXED** — added `shouldLog(5)` in `deduplicatePlayers` (lists removed dup ranks) and `lockAndDeduplicate` (logs lock count) |

### Changes Made

**storageService.ts** — Added `shouldLog` import + 14 new log points:
- Entry: mode, player count, waitForServer, skipServerSync
- Mini-game: localStorage written, POST URL, success/failure, fire-and-forget with try/catch
- LOCAL mode: localStorage write confirm
- SERVER mode: localStorage written, PUT URL, success/failure with status code, fire-and-forget with try/catch

**LadderForm.tsx** — 4 new log points:
- Line 2032: `[RECALC] ABORT: too many player mismatches (N players differ) — likely wrong mini-game file`
- Line 2039: `[RECALC] ABORT: duplicate ranks detected — <details>`
- Line 2043: `[RECALC] ABORT: user declined to continue with data integrity issues`
- Line 1539: `[ENTER_GAMES] SKIPPED fillCell: parse failed for "..." — error=N`

**dedupUtils.ts** — Added `shouldLog` import + 3 new log points:
- `deduplicatePlayers`: `[DEDUP] Removed N duplicate(s): P2 (dup of P1), P5 (dup of P3)`
- `deduplicatePlayers`: `[DEDUP] N -> M players`
- `lockAndDeduplicate`: `[LOCK] Locked N players (added "_" suffix to all results)`
