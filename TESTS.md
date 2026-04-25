# Unit Test Suite

**Version: 1.0.2**

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
Test Files  15 passed (15)
 Tests      234 passed | 2 skipped (236)
Duration    ~Zs
```

### Server Only
```bash
cd server && npm run test:run   # Run once
cd server && npm test            # Watch mode
```

Server tests use `node` environment. Client tests use `jsdom`.

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
│   │   └── optimize2D.test.ts  # 2D grid optimization (bf × ms sweep)
│   ├── simple.test.ts          # Basic smoke test
│   └── setup.ts                # Vitest setup
├── components/
│   └── LadderForm.test.tsx     # Component rendering tests
server/
├── test/
│   ├── adminLock.test.ts       # Admin lock acquire/release/force/refresh/status
│   ├── authRoutes.test.ts      # Auth middleware constants and signatures
│   └── backup.test.ts          # Backup system: create, list, restore, delete, rotate
└── vitest.config.ts            # Server-only vitest config (node env)
```

---

## Current Test Coverage

**Total: 236 tests** across client and server. **234 passed, 2 skipped.**

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

### Client Component Tests (3 passed)

| File | Tests | Description |
|------|-------|-------------|
| `LadderForm.test.tsx` | 3 | Component rendering tests |

### Server Tests (51 passed)

| File | Tests | Description |
|------|-------|-------------|
| `adminLock.test.ts` | 22 | Admin lock acquire/release/force/refresh/status/workflows |
| `authRoutes.test.ts` | 9 | Auth middleware constants, exports, and function signatures |
| `backup.test.ts` | 20 | Backup system: create, list, restore, delete, rotate, full workflow |

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

## Fixtures

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
