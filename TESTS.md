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
Test Files  9 passed (9)
 Tests      88 passed | 2 skipped (90)
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
│   │   └── auth.test.ts        # Auth exports + file extension validation
│   ├── simple.test.ts          # Basic smoke test
│   └── setup.ts                # Vitest setup
├── components/
│   └── LadderForm.test.tsx     # Component rendering tests
server/
├── test/
│   ├── adminLock.test.ts       # Admin lock acquire/release/force/refresh/status
│   └── authRoutes.test.ts      # Auth middleware constants and signatures
└── vitest.config.ts            # Server-only vitest config (node env)
```

---

## Current Test Coverage

**Total: 90 tests** across client and server. **88 passed, 2 skipped.**

### Client Unit Tests (70 passed | 2 skipped)

| File | Tests | Passed | Description |
|------|-------|--------|-------------|
| `newDay.test.ts` | 19 | 19 | Title progression and new day processing |
| `migration.test.ts` | 13 | 13 | Local ↔ Server data migration |
| `auth.test.ts` | 10 | 10 | Auth middleware exports + file extension validation |
| `ratingFormula.test.ts` | 9 | 7 (+2 skipped) | Elo rating formula calculations |
| `utils.test.ts` | 4 | 4 | Error message utilities |
| `simple.test.ts` | 1 | 1 | Basic smoke test |

### Client Component Tests (3 passed)

| File | Tests | Description |
|------|-------|-------------|
| `LadderForm.test.tsx` | 3 | Component rendering tests |

### Server Tests (31 passed)

| File | Tests | Description |
|------|-------|-------------|
| `adminLock.test.ts` | 22 | Admin lock acquire/release/force/refresh/status/workflows |
| `authRoutes.test.ts` | 9 | Auth middleware constants, exports, and function signatures |

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

1. Creates N players with spread ratings (40-point intervals around 1200)
2. Generates matches each round using Elo probability + 10% draw rate
3. Processes batches of games: recalc → simulated New Day → measure RSS
4. After all rounds, runs two final single-pass recalcs on the last batch to measure remaining drift
5. Writes reports to `src/test/unit/reports/`

### Output

**Console** — per-config summary:
```
  [SP] 20p_2p: FinalRSS=1095.41, F1=1081.81, F2=1072.02
  [DP] 20p_2p: FinalRSS=1095.14, F1=1081.65, F2=1071.89
```

**`reports/summary.tsv`** — all configs in TSV format:
```
Config    Final1    Final2    RSS_1    RSS_2    RSS_3    ...
20p_2p_sp 1081.81   1072.02   801.45   921.32   1018.11  ...
20p_2p_dp 1081.65   1071.89   801.37   924.14   1017.36  ...
```

**`reports/20p_*.tab`** — full ladder format (.tab) for 20-player configs. `Rating` column shows original starting ratings (unchanged), `N Rate` shows new calculated ratings, columns 1-31 populated with game result strings (e.g. `0W13_`, `0L11_`, `0D8_`)

### Configs

| Players | Game Types | Modes | Total |
|---------|-----------|-------|-------|
| 20, 50, 100 | 2p, 4p | SP, DP | 12 |

- **SP** = single-pass (VB6 behavior)
- **DP** = double-pass averaging (convergence fix)
- Double-pass only affects `num_games === 0` players; once all players have game history, SP and DP converge

### Interpreting Results

- **RSS history** should trend upward as games accumulate, then stabilize
- **Final1 vs Final2** shows remaining drift — lower difference = better convergence
- 4p games generally show lower RSS than 2p (side averaging dampens swings)


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
