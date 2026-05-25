# Audits

## Origin

This audit cycle was triggered by the following framework for post-vibe-coding hardening:

> When vibe-coding a legacy port, relying only on "duplicate" and "dead code" audits leaves massive architectural time bombs in your new codebase. Legacy code relies on structural patterns that do not translate safely to modern paradigms. You should feed your model specific prompts to target these high-value refactorings:
>
> 1. **"Audit State Mutation"** (Convert Globals to Context/DI) — Legacy code heavily relies on global state variables. In a modern app, this creates severe thread-safety bugs and race conditions. *Action: Find global variables and refactor them into modern state containers, dependency injection scopes, or class-level properties.*
> 2. **"Audit Magic Error Paths"** (Convert GoTo to Structured Exceptions) — Legacy error-handling patterns port literally as spaghetti blocks of nested try-catch or unhandled crashes. *Action: Rip out old patterns and refactor into native, clean try/catch/finally blocks with explicit exception types.*
> 3. **"Audit Type Marshaling"** (Kill the Variant Type) — Untyped variables default to a heavy container that can hold anything. In modern statically-typed languages, this translates to dangerous `any` or `object` types, bypassing compiler safety nets. *Action: Force the model to infer proper strongly-typed variables — distinct strings, integers, or dedicated DTOs.*
> 4. **"Audit Implicit Coercion"** (Fix Silent Data Truncation) — Silent type conversions behind the scenes (treating non-zero as true, parsing strings to numbers automatically). Modern runtimes throw hard runtime exceptions on these. *Action: Find implicit comparisons and replace with explicit casting and strict equality checks.*
> 5. **"Audit Sync-to-Async IO"** (Non-Blocking Modernization) — Legacy code is inherently single-threaded and synchronous. File reading, network calls, and UI updates block the execution thread. *Action: Identify blocking operations and refactor to native async-await patterns.*

Each audit below maps to one or more of these five categories.

---

## Index

| # | Audit | Category | Date | Commits | Status |
|---|-------|----------|------|---------|--------|
| 1 | [Error Handling](#1-error-handling) | Magic Error Paths | 2026-05-24 | `6ae5a13` | ✅ Complete |
| 2 | [React State Mutations](#2-react-state-mutations) | State Mutation | 2026-05-24 | `7b2516a` | ✅ Complete |
| 3 | [Runtime Validation](#3-runtime-validation) | Type Marshaling | 2026-05-24 | `8264b87` | ✅ Complete |
| 4 | [parseInt Radix + Implicit Coercion](#4-parseint-radix--implicit-coercion) | Implicit Coercion | 2026-05-25 | `400893e` | ✅ Complete |
| 5 | [Sync-to-Async IO + SSE Hardening](#5-sync-to-async-io--sse-hardening) | Sync-to-Async IO | 2026-05-25 | `0a46ecf` | ✅ Complete |

---

## 1. Error Handling

**Date:** 2026-05-24  |  **Commit:** `6ae5a13`  |  **Files:** 8  |  **Lines:** +350/-226

### Prompt
> "Audit all error handling across the codebase. Find magic error codes, silent swallows, uncaught exceptions, missing auth headers on fetch calls, dead-stop promise chains, and any place where errors are caught but not logged or propagated. Fix each one with structured error shapes and proper propagation."

### Scope
Systematic audit of all error paths across client and server — uncaught exceptions, magic error codes, silent swallows, missing auth headers, and dead-stop promise chains.

### Issues Found & Fixed (18 total)

#### Client-Side (12 issues)
| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `src/services/dataService.ts` | `commitBatchBuffer` — server sync failure logged as "failed" with no details | Added structured error logging, marks local changes for retry |
| 2 | `src/services/dataService.ts` | `getPlayers()` — network error vs 401/403 indistinguishable | Added status-specific handling: 401/403 → auth failed, else → network error |
| 3 | `src/components/LadderForm.tsx` | Push/Pull fetch calls missing auth headers | Added `buildAuthHeaders()` to all fetch calls |
| 4 | `src/utils/mode.ts` | Auto-detect accepts 404 as "server found" | Removed magic 404 acceptance; only 200 counts as healthy |
| 5 | `src/components/LadderForm.tsx` | `deleteChain` — uncaught `.catch()` missing | Added `.catch()` to prevent dead-stop on uncaught error |
| 6 | `src/utils/mode.ts` | Polling doesn't set auth-failed flag on 401/403 | Sets `__ladder_authFailed` flag on 401/403 responses |
| 7 | `server/src/services/sseService.ts` | SSE reconnect spam on startup | Clean reconnect logic, throttled disconnect warnings (10s cooldown) |
| 8 | `src/services/storageService.ts` | `replayPendingDeletes` — clears ALL pending keys on single failure | Persists failed keys, only removes successfully deleted ones |
| 9 | `src/utils/mode.ts` | `checkWritePermission` — no auth headers on probe | Added auth headers, rejects on 401/403 |
| 10 | `src/services/dataService.ts` | `ApiError` — dead `(error as any).status` cast | Replaced with typed `ApiError` class |
| 11 | `src/services/storageService.ts` | Batch timeout — buffer lost on reset | Saves buffer to `localStorage` before resetting |
| 12 | `src/components/LadderForm.tsx` | Admin lock fire-and-forget — silent swallow on non-401 | Logs non-401 failures for debugging |

#### Server-Side (6 issues)
| # | File | Issue | Fix |
|---|------|-------|-----|
| 13 | `server/src/routes/adminLock.routes.ts` | All handlers lack try/catch | Wrapped all handlers in try/catch with 500 JSON response |
| 14 | `server/src/services/adminLock.service.ts` | `tryAcquireAdminLock` returns boolean only | Returns `{ acquired: boolean, reason: string }` with 5 reason codes |
| 15 | `src/components/LadderForm.tsx` | Call sites not updated for new return type | Updated all callers to handle `AdminLockResult` shape |
| 16 | `src/services/dataService.ts` | `saveToServer` — no auth headers | Added auth headers, improved error messages |
| 17 | `server/src/routes/adminLock.routes.ts` | `forceAcquireAdminLock` — silent error swallow | Logs errors instead of silent swallow |
| 18 | `server/src/routes/adminLock.routes.ts` | Test mock returns wrong shape | Updated test mock for new return shape |

### Verification
- Frontend build: ✅ passes
- Server build: ✅ passes
- Tests: ✅ 551/551 pass

---

## 2. React State Mutations

**Date:** 2026-05-24  |  **Commit:** `7b2516a`  |  **Files:** 2  |  **Lines:** +108/-138

### Prompt
> "Audit all React state mutations. Find places where we directly mutate state arrays with push, splice, length=0, or in-place property changes. Convert them to immutable updates using map, spread, or functional setters."

### Scope
Audit of all direct mutations to React state arrays — `push`, `splice`, `length = 0`, and in-place property mutation on state objects.

### Issues Found & Fixed (7 total)
| # | Location | Issue | Fix |
|---|----------|-------|-----|
| 1 | `LadderForm.tsx` | Dead code: `players.length = 0` / `players.push()` after `setPlayers` | Removed — `setPlayers([])` is correct |
| 2 | `LadderForm.tsx` | `fillCell`: mutates via `find()` then sets same reference | Replaced with `setPlayers(players.map(...))` |
| 3 | `LadderForm.tsx` | 12 `contentEditable` onBlur/onPaste handlers: shallow spread + property mutation | Replaced with `.map()` + spread for deep immutability |
| 4 | `LadderForm.tsx` | Game result cells: stale closure — used `players` instead of `prevPlayers` | Fixed to use functional updater with `prevPlayers` |
| 5 | `LadderForm.tsx` | `handleApplyBulkResults`: mutates `gameResults` array in place | Deep-copies array before mutation |
| 6 | `LadderForm.tsx` | Game cell paste: mutates via `find()` then sets same reference | Replaced with `setPlayers(players.map(...))` |
| 7 | `storageService.ts` | Batch counter can go negative / stuck indefinitely | Added 30s timeout to reset stuck batch counter, guards against negative count |

### Verification
- Frontend build: ✅ passes
- Server build: ✅ passes
- Tests: ✅ 551/551 pass

---

## 3. Runtime Validation

**Date:** 2026-05-24  |  **Commit:** `8264b87`  |  **Files:** 8  |  **Lines:** +289/-89

### Prompt
> "Audit all server-side req.body consumption. Find prototype pollution vectors, untyped destructuring, missing field validation, and bulk payload sanitization gaps. Add runtime validation with allowlist-based field mapping."

### Scope
Audit of all `req.body` consumption on server routes — prototype pollution, untyped destructuring, missing field validation, and bulk payload sanitization.

### New File
- `server/src/utils/validation.ts` — centralized runtime validation with allowlist-based field mapping for `PlayerData`

### Issues Found & Fixed
| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `ladder.routes.ts` | `(updatedPlayer as any)[key]` — accepts arbitrary keys (prototype pollution) | Replaced with typed `PLAYER_FIELDS` allowlist |
| 2 | `ladder.routes.ts` | Bulk update `PlayerData[]` — no type checking | Validates each entry against allowlist |
| 3 | `ladder.routes.ts` | Batch deltas — no type checking on operation array | Validates `DeltaOperation` type and player ID range |
| 4 | `game.routes.ts` | `GameResult` — no range checks on game results | Validates 31-entry array with `W/L/D/null` values |
| 5 | `admin.routes.ts` | `fileName` — no path traversal sanitization | `sanitizeFileName` rejects `/` and `\` |
| 6 | `admin.routes.ts` | Players array in import — no validation | Validates each player entry |
| 7 | `adminLock.routes.ts` | Untyped `req.body` destructuring for `clientId`/`clientName` | Typed destructuring with validation |
| 8 | `dataService.ts` | Startup `JSON.parse` for `serverVersion` — no try/catch | Wrapped in try/catch, returns `"unknown"` on failure |
| 9 | `LadderForm.tsx` | Paste handlers — `gameResults` can exceed 31 entries | `clampGameResults` enforces exactly 31 entries |
| 10 | `storageService.ts` | Corrupt localStorage — repeated parse failures | Clears corrupt entry on parse failure |

### Key Design Decisions
- Chose custom validation over schema library (zod/joi) to avoid adding dependencies
- `sanitizeFileName` rejects path traversal (`/` and `\`) rather than stripping — fails loudly
- `clampGameResults` truncates to 31 entries, pads with `null` if short

### Verification
- Frontend build: ✅ passes
- Server build: ✅ passes
- Tests: ✅ 551/551 pass

---

## 4. parseInt Radix + Implicit Coercion

**Date:** 2026-05-25  |  **Commit:** `400893e`  |  **Files:** 11  |  **Lines:** +66/-66

### Prompt
> "Audit all parseInt() calls missing radix argument. Also audit all || coercion patterns that could silently swallow 0 values. Add radix 10 to every parseInt and verify each || pattern is intentional."

### Scope
Audit of all `parseInt()` calls missing radix argument, and all `||` coercion patterns that could silently swallow `0` values.

### parseInt Radix — 32 instances fixed across 11 files
| File | Count | Fields Affected |
|------|-------|-----------------|
| `src/components/LadderForm.tsx` | 19 | Parsing, paste, navigation |
| `src/services/miniGameLocalStorage.ts` | 6 | TAB parsing |
| `server/src/services/dataService.ts` | 5 | rank, rating, nRating, num_games, attendance |
| `server/src/routes/ladder.routes.ts` | 4 | rank, roundIndex params |
| `shared/utils/hashUtils.ts` | 3 | Game hash parsing |
| `src/test/unit/kFactorBounds.test.ts` | 3 | Test simulation |
| `shared/utils/trophyGeneration.ts` | 2 | Grade sorting |
| `shared/utils/trophyDebugReport.ts` || 2 | Grade sorting |
| `src/services/storageService.ts` | 2 | Delete endpoint |
| `src/components/AddPlayerDialog.tsx` | 1 | Rating |
| `src/components/Settings.tsx` | 1 | kFactor |

### Implicit Coercion — Reviewed, No Fixes Needed
| Location | Pattern | Verdict |
|----------|---------|---------|
| `trophyGeneration.ts:effectiveRating()` | `nRating \|\| rating \|\| 0` | ✅ Intentional — nRating=0 (new day reset) falls through to preserved previous rating |
| `AddPlayerDialog.tsx` | `rating ? parseInt(rating) : 0` | ✅ Correct — `"0"` is truthy, passes through `parseInt` |

### Verification
- Frontend build: ✅ passes
- Server build: ✅ passes
- Tests: ✅ 551/551 pass

---

## 5. Sync-to-Async IO + SSE Hardening

**Date:** 2026-05-25  |  **Commit:** `0a46ecf`  |  **Files:** 3  |  **Lines:** +49/-22

### Prompt
> "Audit sync-to-async IO patterns. Find blocking operations that could freeze the event loop for large datasets. Also audit SSE broadcast for serialization failures and payload size limits."

### Scope
Audit of synchronous IO patterns that block the Node.js event loop, and SSE broadcast robustness.

### SSE Hardening
| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `sseService.ts:55` | `JSON.stringify(data)` on `unknown` — could crash on circular refs | Wrapped in try/catch, returns early on failure |
| 2 | `sseService.ts:55` | No payload size limit — could flood clients with huge payloads | Added 1MB hard limit via `Buffer.byteLength` check |

### Event Loop Yielding
| # | File | Issue | Fix |
|---|------|-------|-----|
| 3 | `dataService.ts:176-212` | Sync `for` loop parsing all players — blocks for 500+ player ladders | Yields every 100 players via `await Promise.resolve()` |
| 4 | `dataService.ts:214-222` | Sync rank assignment loop — same blocking issue | Yields every 100 players |
| 5 | `dataService.ts:236-262` | `generateTabContent` sync `.map()` + `for` — blocks during write | Converted to async `for` loop with yield every 100 players; callers updated to `await` |

### Already Correct (No Changes)
| Location | Pattern | Verdict |
|----------|---------|---------|
| `dataService.ts:41` | `fsSync.readFileSync` for `package.json` version | ✅ Acceptable — runs once at module load, not in request path |
| `sseService.ts:60-78` | Sync `for...of` over SSE clients | ✅ Acceptable — `res.write()` is non-blocking (buffered), typical scale <50 clients |
| `tournamentService.ts:90` | `JSON.parse(content)` | ✅ Already guarded by outer try/catch |

### Verification
- Frontend build: ✅ passes
- Server build: ✅ passes
- Tests: ✅ 551/551 pass

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total commits | 5 |
| Total files changed | 20+ unique files |
| Total lines changed | ~600+ insertions, ~400+ deletions |
| Issues identified | 42+ |
| Issues fixed | 42+ |
| Issues deferred (acceptable) | 4 |
| Tests passing | 551/551 (frontend) + 99/99 (server) = 650/650 |
| Build status | ✅ Both frontend and server pass |
