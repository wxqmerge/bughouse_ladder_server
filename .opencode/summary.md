## Objective
- Complete codebase bug audit and fix regressions, then audit and refactor duplicate code/redundant logic across the client and server. Followed by dead code audit and bug fixes.

## Important Details
- Typechecks pass for both client and server (`tsc --noEmit`).
- All 944 tests pass (`npm run test:run`).
- Architecture context mapped via `graphify-out/GRAPH_REPORT.md` (978 nodes, 70 communities).
- Rating logic: `kFactor` (20) UI configurable; `blendingFactor` (0.99) & `perfMultiplierScale` (0.5) hardcoded in `shared/utils/hashUtils.ts`.
- Admin lock: Fixed 60s auto-expiration in `server/src/services/adminLock.service.ts`.
- Auth: `GET /tournament/*` accepts user key; others require admin key. Middleware allows admin key to bypass user checks; rejects writes if neither key is configured.
- Backups: Max 20 retained; managed via `server/src/routes/admin.routes.ts` & `server/src/services/dataService.ts`.
- 6 bugs fixed and committed (`e4a0196`).
- Duplicate code refactoring completed (`2bf1d3c`): 8/10 findings fixed, ~220 lines removed, 140 added (net -160 lines).
- Dead code cleanup committed (`3f2d5fd`, `7e3840a`, `1020589`): removed unused exports, made internal-only functions non-exported, removed dead `serverDownMode` variable.
- 9 bugs fixed and committed (`7dbce87`): `__dirname` undefined in ESM, hash init always succeeding, SSE race condition, pending deletes data inconsistency, delta interval memory leak, CSP crash on empty CORS, unbounded array growth, deprecated `escape()`, wrong attendance semantics.

## Work State
### Completed
- Verified client & server typechecks and full test suite (944 tests).
- Fixed 6 identified bugs and test regression in `importUploadApiKey.test.tsx` (`e4a0196`).
- Refactored duplicate code across 9 files (`2bf1d3c`).
- Cleaned up dead code across 7 files (`3f2d5fd`, `7e3840a`, `1020589`).
- Fixed 9 bugs from audit (`7dbce87`): 5 HIGH severity, 4 MEDIUM severity.

### Active
- (none)

### Blocked
- (none)

## Next Move
1. Address remaining MEDIUM severity bugs: unbounded promise chain in deleteQueue, SSE no authentication, PII logged at default debug level, `any` type on ladderData.
2. Address LOW severity bugs: interval restarts every render, notifyTimer debounce not cleared on config change.
3. Consider adding integration tests for hash sync and SSE broadcast race conditions.

## Relevant Files
- `shared/utils/hashUtils.ts`: Rating engine logic & constants
- `server/src/routes/admin.routes.ts`: Admin endpoints & backup management; fixed `__dirname` undefined
- `src/services/dataService.ts`: Client-side data access & polling/SSE fallback; fixed hash init bug
- `server/src/services/dataService.ts`: Server-side file I/O & backup rotation
- `server/src/services/sseService.ts`: SSE client management & broadcasting; fixed race condition
- `src/components/LadderForm.tsx`: UI component; fixed deprecated `escape()`
- `src/test/unit/importUploadApiKey.test.tsx`: Test file
- `src/App.tsx` & `src/utils/mode.ts`: Refactored auto-detection logic
- `src/services/storageService.ts`: Refactored prefix derivation; fixed delta interval leak
- `shared/utils/identityMerge.ts`: Contains unused `isIdentityField` export (test-only)
- `shared/utils/trophyGeneration.ts`: Contains internal interfaces (non-exported)
- `server/src/services/tournamentService.ts`: Contains internal tournament lifecycle functions
- `src/utils/mergeUtils.ts`: Fixed pending deletes `''` to `null`
- `server/src/index.ts`: Fixed CSP crash on empty CORS origin
- `server/src/routes/ladder.routes.ts`: Fixed unbounded array growth from delta.round
- `src/components/AddPlayerDialog.tsx`: Fixed attendance = 0 for new players
