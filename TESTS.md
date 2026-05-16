# Unit Test Suite

**Version: 1.2.1**

## Overview

This project uses **Vitest** for testing across client and server. The root vitest config discovers tests in both `src/` and `server/test/`.

---

## Running Tests

### All Tests (Root) — Client + Server
```bash
npm run test:run      # Run once (CI mode)
npm test              # Watch mode
npm run test:coverage # Coverage report
```

Expected output:
```
Test Files  30 passed (30)
 Tests      468 passed | 2 skipped (470)
Duration    ~Zs
```

### Server Only
```bash
cd server && npm run test:run   # Run once
cd server && npm test            # Watch mode
```

Server tests use `node` environment. Client tests use `jsdom`.

---

## Running Tests

### All Tests (Root) — Client + Server
```bash
npm run test:run      # Run once (CI mode)
npm test              # Watch mode
npm run test:coverage # Coverage report
```

### Server Only
```bash
cd server && npm run test:run   # Run once
cd server && npm test            # Watch mode
```

### Server Tournament Tests
```bash
cd server && npm run test:run test/tournament.test.ts       # Core tournament tests
cd server && npm run test:run test/tournamentExtended.test.ts  # Extended: trophy generation, mini-game stress tests
```

### Rating Stress Test
```bash
npx vitest run src/test/unit/ratingStressTest.test.ts --reporter=verbose
```

### Single Test File
```bash
npm test src/test/unit/ratingFormula.test.ts        # Client
cd server && npm run test:run test/adminLock.test.ts  # Server
```

### Single Test by Name
```bash
npm test -t "should return 0.5 when ratings are equal"
```

---

## Test Structure

```
src/
├── test/
│   ├── fixtures/
│   │   └── players.ts          # Test data fixtures
│   ├── unit/                   # Unit tests
│   │   ├── ratingFormula.test.ts
│   │   ├── newDay.test.ts
│   │   ├── migration.test.ts
│   │   ├── utils.test.ts
│   │   ├── auth.test.ts        # Auth exports + file extension validation
│   │   ├── calculateRatings.test.ts  # Rating calculation: blending, Elo, 4p, dual, double-pass
│   │   ├── ratingStressTest.test.ts  # Tournament simulation (20/50/100/150p)
│   │   ├── optimizeBlendingFactor.test.ts  # Single-factor bf optimization
│   │   ├── optimize2D.test.ts  # 2D grid optimization (bf × ms sweep)
│   │   ├── normalize4Player.test.ts      # 4-player pair normalization (all permutations)
│   │   ├── normalize2Player.test.ts      # 2-player ascending sort
│   │   ├── conflictDetection.test.ts     # Entry parsing + conflict detection (2p/4p/cross-type)
│   │   ├── batchFlush.test.ts            # Batch buffer: startBatch/endBatch flush to server
│   │   └── nRatingDefault.test.ts        # nRating defaults to 1 (not 0) for new players
│   ├── simple.test.ts          # Basic smoke test
│   ├── normalizeServerUrl.test.ts      # Server URL normalization (whitespace, protocol, backslash)
│   ├── saveUserSettings.test.ts        # User settings save/load (round-trip, normalization)
│   ├── kFactorBounds.test.ts           # K-Factor clamping (1-100)
│   ├── debugLevelBounds.test.ts        # Debug Level clamping (0-20)
│   ├── exportFilename.test.ts          # First word extraction from project name
│   ├── settingsPersistence.test.ts     # localStorage key prefix and isolation
│   ├── adminLockOverride.test.ts       # Admin lock state, override dialog, refresh/release
│   ├── adminStateFlow.test.ts          # LadderForm → App → Settings isAdmin propagation
│   ├── settingsAdminGating.test.tsx    # Settings admin gating (user vs admin mode)
│   └── restoreBackup.test.ts           # Backup file reading, list, restore confirmation
│   └── setup.ts                # Vitest setup
├── components/
│   ├── LadderForm.test.tsx     # Component rendering tests
│   └── MenuBar.test.tsx        # MenuBar component tests
server/
├── test/
│   ├── adminLock.test.ts       # Admin lock acquire/release/force/refresh/status
│   ├── authRoutes.test.ts      # Auth middleware constants and signatures
│   └── backup.test.ts          # Backup system: create, list, restore, delete, rotate
└── vitest.config.ts            # Server-only vitest config (node env)
```

---

## Current Test Coverage

**Total: 561 tests** across client and server. **All passed.**

### Test Count Breakdown (v1.2.1)

| Category | Tests | Notes |
|----------|-------|-------|
| Client unit tests | ~350 | Rating formula, stress tests, normalization, conflict detection, settings, admin lock, etc. |
| Client component tests | ~75 | LadderForm, MenuBar, Settings gating |
| Server tests | ~136 | Admin lock, auth, backup, tournament, mini-games |

### Client Unit Tests

| File | Tests | Passed | Description |
|------|-------|--------|-------------|
| `newDay.test.ts` | 19 | 19 | Title progression and new day processing |
| `migration.test.ts` | 13 | 13 | Local ↔ Server data migration |
| `auth.test.ts` | 10 | 10 | Auth middleware exports + file extension validation |
| `ratingFormula.test.ts` | 9 | 7 (+2 skipped) | Elo rating formula calculations |
| `utils.test.ts` | 4 | 4 | Error message utilities |
| `simple.test.ts` | 1 | 1 | Basic smoke test |
| `calculateRatings.test.ts` | 30 | 30 | Rating calculation: blending, Elo, 4p, dual results, double-pass |
| `ratingStressTest.test.ts` | 28 | 28 | Tournament simulation: 20/50/100/150 players, 2p/4p, ng0/mixed/ng20 |
| `optimizeBlendingFactor.test.ts` | 1 | 1 | Single-factor blending factor optimization sweep |
| `optimize2D.test.ts` | 1 | 1 | 2D grid optimization (blending factor × perf multiplier scale) |
| `normalize4Player.test.ts` | 18 | 18 | 4-player normalization: pair swaps, pair reordering, equal values, conflict equivalence |
| `normalize2Player.test.ts` | 11 | 11 | 2-player normalization: ascending sort, equal values, conflict equivalence |
| `conflictDetection.test.ts` | 25 | 25 | Entry parsing (2p/4p formats), 2p vs 2p conflicts, 4p vs 4p conflicts, cross-type prevention |
| `batchFlush.test.ts` | 9 | 9 | Batch buffer: state management, nested batches, getPlayers during batch, New Day flush sequence |
| `nRatingDefault.test.ts` | 12 | 12 | nRating defaults to 1 via `Math.abs(value || 1)` for all falsy cases (0, null, undefined, "") |
| `normalizeServerUrl.test.ts` | 17 | 17 | Whitespace trimming, protocol prefix, backslash normalization |
| `saveUserSettings.test.ts` | 17 | 17 | Server URL normalization, API key preservation, debugMode, round-trip persistence |
| `kFactorBounds.test.ts` | 18 | 18 | Clamping <1→1, >100→100, Settings input simulation |
| `debugLevelBounds.test.ts` | 16 | 16 | Clamping <0→0, >20→20, Settings input simulation |
| `exportFilename.test.ts` | 13 | 13 | First word extraction from project name (space-delimited) |
| `settingsPersistence.test.ts` | 11 | 11 | localStorage key prefix, isolation, user settings key |
| `adminLockOverride.test.ts` | 18 | 18 | Lock state detection, override dialog, refresh/release/notification |
| `adminStateFlow.test.ts` | 12 | 12 | LadderForm → App → Settings prop propagation |
| `restoreBackup.test.ts` | 24 | 24 | File reading, backup list, restore confirmation, filename format, dialog UI |

### Client Component Tests (75 passed)

| File | Tests | Description |
|------|-------|-------------|
| `LadderForm.test.tsx` | 3 | Component rendering tests |
| `MenuBar.test.tsx` | 59 | MenuBar component rendering, menu items, admin/user mode visibility |
| `settingsAdminGating.test.tsx` | 13 | Settings admin gating: Configuration/Actions hidden in user mode, Server Connection always visible |

### Server Tests (58 passed)

| File | Tests | Description |
|------|-------|-------------|
| `adminLock.test.ts` | 22 | Admin lock acquire/release/force/refresh/status/workflows |
| `authRoutes.test.ts` | 9 | Auth middleware constants, exports, and function signatures |
| `backup.test.ts` | 27 | Backup system: create, list, restore, delete, rotate, full workflow |

---

## Test Categories

### 1. Rating Formula Tests
Tests the Elo probability formula:
- Equal ratings → 50% win probability
- Higher rating → >50% probability
- Lower rating → <50% probability
- Extreme rating differences approach 0% or 100%

**Example:**
```typescript
import { formula } from '../../../shared/utils/hashUtils';

it('should return 0.5 when ratings are equal', () => {
  const result = formula(1200, 1200);
  expect(result).toBeCloseTo(0.5, 5);
});
```

### 2. New Day Tests
Tests title progression and player transformations:
- Title cycling through mini games (BG_Game → Bishop_Game → Pillar_Game → Kings_Cross → Pawn_Game → Queen_Game)
- Rating updates from nRating
- Game count recalculation
- Attendance tracking
- Optional re-ranking by rating

**Example:**
```typescript
import { getNextTitle } from '../../../src/utils/constants';

it('should progress through all mini game titles in order', () => {
  const titles = ['BG_Game', 'Bishop_Game', 'Pillar_Game', 'Kings_Cross', 'Pawn_Game', 'Queen_Game'];
  for (let i = 0; i < titles.length; i++) {
    expect(getNextTitle(titles[i])).toBe(titles[(i + 1) % titles.length]);
  }
});
```

### 3. Migration Tests
Tests local ↔ server data migration:
- Rank/name mismatch detection
- Player list merging strategies (use-server, use-local, merge, dont-merge)
- Non-result field preservation (all 13 fields)
- Game results merging

**Example:**
```typescript
import { detectRankNameMismatches } from '../../../src/utils/migrationUtils';

it('should detect mismatch when last names differ at same rank', () => {
  const localPlayers = [createPlayer({ rank: 1, lastName: 'Smith' })];
  const serverPlayers = [createPlayer({ rank: 1, lastName: 'Johnson' })];
  
  const result = detectRankNameMismatches(localPlayers, serverPlayers);
  expect(result.hasMismatch).toBe(true);
});
```

### 4. Auth Tests (Client)
Tests auth middleware exports and file extension validation:
- ADMIN_API_KEY and USER_API_KEY constants are defined
- requireAdminKey and requireUserKey functions exist with correct signatures
- File extensions (.tab, .xls, .txt) accepted for import; unsupported rejected

### 5. Admin Lock Tests (Server)
Tests in-memory admin lock service:
- Acquire when free, reject when held by another client
- Force override returns previous holder info
- Release only works for lock owner
- Refresh extends expiration for lock holder
- Full acquire → refresh → release cycle
- Expired locks treated as free

### 6. Auth Routes Tests (Server)
Tests auth middleware exports and function signatures:
- ADMIN_API_KEY and USER_API_KEY constants exported from module
- requireAdminKey and requireUserKey are Express middleware functions (3 params)

---

## Writing New Tests

### Client Unit Test Template
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../../path/to/module';

describe('MyModule', () => {
  describe('myFunction', () => {
    it('should do something', () => {
      const result = myFunction(input);
      expect(result).toBe(expected);
    });
  });
});
```

### Server Test Template
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../src/services/myModule.js';

describe('MyService', () => {
  it('should do something', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });
});
```

### Component Test Template
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText(/expected text/i)).toBeInTheDocument();
  });
});
```

---

## New Tests (v1.1)

### What Changed

The test suite expanded from **231 → 470 tests** (+239) across two waves:

**Wave 1 (+88 tests):** Bug fix coverage for recent fixes
| Area | Tests | What's Covered |
|------|-------|----------------|
| **Player normalization** | 29 | `normalize4Player` (18), `normalize2Player` (11) |
| **Conflict detection** | 25 | Entry parsing, 2p/4p conflicts, cross-type prevention |
| **Batch operations** | 9 | `startBatch`/`endBatch` buffer flush, nested batches |
| **UI gating** | 13 | Settings admin vs user mode panel visibility |
| **Player defaults** | 12 | nRating defaults to 1 (not 0) for new players |

**Wave 2 (+151 tests):** Input validation, state flow, and integration
| Area | Tests | What's Covered |
|------|-------|----------------|
| **Server URL normalization** | 17 | Whitespace trimming, protocol prefix, backslash normalization |
| **User settings save/load** | 17 | Whitespace trimming, API key preservation, debugMode, round-trip |
| **K-Factor bounds** | 18 | Clamping <1→1, >100→100, Settings input simulation |
| **Debug Level bounds** | 16 | Clamping <0→0, >20→20, Settings input simulation |
| **Export filename** | 13 | First word extraction from project name (space-delimited) |
| **Settings persistence** | 11 | localStorage key prefix, isolation, user settings key |
| **Admin lock override** | 18 | Lock state detection, override dialog, lock refresh/release |
| **Admin state flow** | 12 | LadderForm → App → Settings prop propagation |
| **Restore backup** | 24 | File reading, backup list, restore confirmation, filename format, dialog UI |

### Key Differences

**Old tests focused on:**
- Rating formula correctness (Elo probability)
- New day processing (title progression, transformations)
- Migration logic (local ↔ server data sync)
- Rating calculation with complex blending factors
- Server-side admin lock, auth, and backup systems

**Wave 1 tests focus on (data integrity):**
- **Normalization correctness** — verifying that `normalize4Player` and `normalize2Player` produce identical outputs for all permutations of the same game, which is critical for conflict detection
- **Entry parsing formats** — 2-player entries use `12W13` (no colon), 4-player entries use `12:13W23:25` (colons within pairs, no underscore between pairs)
- **Cross-type prevention** — 2p and 4p games must never conflict, even with overlapping player ranks
- **Batch flush reliability** — ensuring `endBatch()` is called before `window.location.reload()` during New Day to prevent data loss
- **UI permission gating** — Configuration and Actions panels only visible when `isAdmin=true`
- **Defensive defaults** — new players get `nRating: 1` via `Math.abs(value || 1)`, never 0 (zero ratings are invalid)

**Wave 2 tests focus on (input validation & state flow):**
- **Input sanitization** — server URLs trimmed, normalized (protocol prefix, backslash → forward slash), API keys preserved as-is
- **Input clamping** — K-Factor (1–100), Debug Level (0–20) validated at the Settings input boundary
- **State propagation** — `isAdmin` state flows LadderForm → App → Settings via callback + prop, verified through unit simulation
- **Persistence correctness** — localStorage keys use correct prefix (`ladder_` vs `ladder_server_`), user settings round-trip verified
- **Export filename** — project name with spaces → first word only (e.g., "Kings Cross" → "Kings")
- **Backup resilience** — file reading, list fetching, restore confirmation, filename format validation

### Test File Details

#### `normalize4Player.test.ts` (18 tests)
Tests the 4-player normalization function used by conflict detection:
- Within-pair swaps: `13:12,23:25` → `12:13,23:25`
- Pair reordering: `23:25,12:13` → `12:13,23:25`
- Equal values: `12:12,23:25` → `12:12,23:25`
- All 8 permutations of `{1,2,3,4}` produce identical output
- Large ranks, single digits, all-same values

#### `normalize2Player.test.ts` (11 tests)
Tests the 2-player normalization function:
- Ascending sort: `2,1` → `1,2`
- Already sorted: `1,2` → `1,2`
- Equal values: `5,5` → `5,5`
- Both orderings produce same result (conflict detection equivalence)

#### `conflictDetection.test.ts` (25 tests)
Tests the full conflict detection pipeline:
- **Entry parsing**: 2-player (`12W13`), 4-player (`12:13W23:25`), invalid formats
- **2p vs 2p**: Same players in any order conflict, different players don't
- **4p vs 4p**: All 4 players must match (normalized) to conflict
- **Cross-type**: 2p and 4p never conflict, even with same ranks
- **Partial entries**: 3-player entries treated as 2-player (player4 = 0)

#### `batchFlush.test.ts` (9 tests)
Tests the batch buffer system used during New Day:
- **State management**: `startBatch`/`endBatch` nesting with counter
- **Buffer isolation**: localStorage unchanged during batch, committed on `endBatch`
- **Nested batches**: Multiple `startBatch` calls require matching `endBatch` calls
- **New Day flush**: `startBatch` → `savePlayers` → `endBatch` → `window.location.reload()`

#### `settingsAdminGating.test.tsx` (13 tests)
Tests admin gating in Settings dialog:
- **User mode**: Configuration panel hidden, Actions panel hidden, Server Connection visible
- **Admin mode**: All panels visible, all buttons present
- **Specific elements**: Show Ratings, Debug Level, K-Factor, New Day, Clear All, Set Sample Data

#### `nRatingDefault.test.ts` (12 tests)
Tests the `Math.abs(value || 1)` pattern used in LadderForm:
- Falsy values (0, null, undefined, "") → default to 1
- Positive values preserved
- Negative values abs'd
- Edge case: rating = 1 → nRating = 1 (not default)

---

### Wave 2 Test File Details

#### `normalizeServerUrl.test.ts` (17 tests)
Tests the `normalizeServerUrl` function in `userSettingsStorage.ts`:
- **Whitespace trimming**: leading/trailing spaces, tabs, newlines
- **Protocol prefix**: adds `http://` when missing, preserves `https://`
- **Backslash normalization**: `omen\com` → `omen/com`
- **Edge cases**: empty string, whitespace-only, localhost, IP addresses

#### `saveUserSettings.test.ts` (17 tests)
Tests `saveUserSettings` / `loadUserSettings` round-trip:
- Server URL normalized on save (protocol added, backslashes converted)
- API key preserved as-is (no trimming)
- debugMode defaults to `false` when missing from old localStorage
- Missing fields handled gracefully (old data compatibility)
- Overwrite behavior verified (last write wins)

#### `kFactorBounds.test.ts` (18 tests)
Tests K-Factor clamping at Settings input boundary:
- `Math.max(1, Math.min(100, value))` clamps <1→1, >100→100
- Settings input simulation: `parseInt(e.target.value) || 20` handles empty/invalid → default 20
- Boundary values: 1 and 100 preserved exactly
- Float values handled correctly

#### `debugLevelBounds.test.ts` (16 tests)
Tests Debug Level clamping at Settings input boundary:
- `Math.max(0, Math.min(20, value))` clamps <0→0, >20→20
- Settings input simulation: empty/invalid → default 5, 0 → 0 (no debug output)
- Boundary values: 0 and 20 preserved

#### `exportFilename.test.ts` (13 tests)
Tests first-word extraction for export filenames:
- `projectName.split(' ')[0]` — space-delimited, not underscore
- Single word: "KingsCross" → "KingsCross"
- Multiple words: "Bughouse Chess Ladder" → "Bughouse"
- Edge cases: empty string, leading spaces, underscores, special characters

#### `settingsPersistence.test.ts` (11 tests)
Tests localStorage key management:
- `getKeyPrefix()` returns `'ladder_'` in local mode, `'ladder_server_'` in server mode
- Key isolation: prefixed keys don't collide with non-prefixed keys
- User settings key: `'bughouse-ladder-user-settings'` persists correctly
- Different project names produce different prefixes (when in server mode)

#### `adminLockOverride.test.ts` (18 tests)
Tests admin lock state machine and override dialog:
- **Lock state detection**: `locked: true/false`, holder info, expiration, server reachability
- **Override dialog**: shown when lock held, hidden when free/unreachable
- **Lock lifecycle**: acquire → refresh (extend expiry) → release (owner only)
- **Notifications**: status change detection, self-acquired lock handling

#### `adminStateFlow.test.ts` (12 tests)
Tests `isAdmin` state propagation through component hierarchy:
- **Callback pattern**: `onAdminChange` callback from LadderForm → `setIsAdmin` in App
- **Prop flow**: App state → `isAdmin` prop → Settings component
- **Full lifecycle**: user mode → admin mode → user mode, all three components stay in sync
- **Edge cases**: rapid toggles, undefined/null handling

#### `restoreBackup.test.ts` (24 tests)
Tests backup restore flow:
- **File reading**: valid JSON parsing, corrupted file handling, structure validation
- **Backup list**: server fetch, empty list, error handling
- **Restore confirmation**: dialog shown, cancellation, data loss warning
- **Filename format**: `backup_YYYY-MM-DD_HH-MM-SS.json` regex validation
- **URL encoding**: `encodeURIComponent()` for special characters in filenames
- **Dialog UI**: backup list display, empty state, button enable/disable

Test fixtures are stored in `src/test/fixtures/`:

```typescript
// src/test/fixtures/players.ts
export const simplePlayers: PlayerData[] = [
  {
    rank: 1,
    group: 'A',
    lastName: 'Smith',
    firstName: 'John',
    rating: 1500,
    // ...
  },
];
```

Import fixtures in tests:
```typescript
import { simplePlayers } from '../fixtures/players';
```

---

## CI Integration

Tests run automatically in CI pipeline. All tests must pass for merges.

### Passing Criteria
- All unit tests must pass
- No new test coverage regressions
- Component tests should not have unhandled errors
- Server tests must pass independently (`cd server && npm run test:run`)

---

## Debugging Tests

### Run Single Test File (Client)
```bash
npm test src/test/unit/ratingFormula.test.ts
```

### Run Single Test (Client)
```bash
npm test -t "should return 0.5 when ratings are equal"
```

### Run Server Test File
```bash
cd server && npm run test:run test/adminLock.test.ts
```

### Debug in VS Code
1. Set breakpoint in test file
2. Click debug icon next to test
3. Or use `console.log()` for simple debugging

---

## Stress Test — Rating Convergence

The stress test simulates tournaments with seeded PRNG and Elo-weighted game results to measure rating convergence via RSS (root-mean-square deviation from starting ratings).

### Running the Stress Test

```bash
# Run with verbose output (shows console RSS per config)
npx vitest run src/test/unit/ratingStressTest.test.ts --reporter=verbose
```

### What It Does

1. Creates N players with ratings spread from 100 to 1800
2. Sorts by **start rating** (not current), Fisher-Yates shuffle each round
3. Generates matches with 30% dual results (two independent game outcomes)
4. 600-point filter uses **start ratings** to prevent drift-based skips
5. Processes all matches with double-pass averaging recalcs
6. Writes reports to `src/test/unit/reports/`

### Output

**Console** — per-config summary:
```
  20p_2p_ng0: FinalRSS=192.89, F1=203.29, F2=195.64
```

**`reports/summary.tsv`** — all 24 configs (20p/50p/100p/150p) in TSV format:
```
Config    Final1    Final2    RSS_1    RSS_2    RSS_3    ...
20p_2p_ng0 203.29   195.64   160.48   175.37   185.64  ...
```

**`reports/20p_*.tab`** — full ladder format (.tab) for 20-player configs. `Rating` column shows original starting ratings (unchanged), `N Rate` shows new calculated ratings, columns 1-31 populated with game result strings (e.g. `0W13_`, `0L11_`, `0D8_`)

### Configs

| Players | Game Types | Modes | Total |
|---------|-----------|-------|-------|
| 20, 50, 100 | 2p, 4p | ng0, ng0-10, ng20 | 18 |
| 150 | 2p, 4p | ng0, ng0-10, ng20 | 6 |
| **Total** | | | **24** |

- **ng0** = all players start with 0 games (full blending)
- **ng0-10** = random 0-10 games per player (mixed blending/Elo)
- **ng20** = all players start with 20 games (pure Elo)
- Double-pass averaging always used

### Interpreting Results

- **RSS history** should trend upward as games accumulate, then stabilize
- **Final1 vs Final2** shows remaining drift — lower difference = better convergence
- 4p games generally show lower RSS than 2p (side averaging dampens swings)
- 30% dual results add variance — dual wins/losses produce larger perfRating swings
- 600-point filter based on start ratings prevents unrealistic late-game pairings


## Test Configuration

| Setting | Client | Server |
|---------|--------|--------|
| **Framework** | Vitest v4.x | Vitest v4.x |
| **Environment** | jsdom (browser simulation) | node |
| **Setup File** | `src/test/setup.ts` | None |
| **Config** | `vitest.config.ts` | `server/vitest.config.ts` |

---

## Test Best Practices

1. **Use `waitFor()`** for async operations (data loading, state updates)
2. **Prefer semantic queries**: `getByRole()`, `getByText()` over `query_selector`
3. **Test behavior, not implementation**: Focus on what users see/do
4. **Use descriptive test names**: `"should update rating when game is added"`
5. **Reset shared state** in `beforeEach` for server tests with mutable state

---

## Notes

- Client tests run in **jsdom** environment (browser-like)
- Server tests run in **node** environment
- Use `import.meta.env` for environment variables
- Mock external dependencies with `vi.mock()`
- Use `beforeEach`/`afterEach` for setup/teardown
- Backup creation (`createBackup`/`rotateBackups`) is skipped during test runs (`VITEST` env var) to prevent unnecessary file I/O
