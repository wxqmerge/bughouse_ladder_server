# Unit Test Suite

## Overview

This project uses **Vitest** for unit testing with **React Testing Library** for component tests.

For debugging and running in different modes, see [README_DEBUG.md](./README_DEBUG.md).

---

## Running Tests

### Run All Tests Once (CI Mode)
```bash
npm run test:run
```

Expected output:
```
Test Files  X passed (X)
 Tests      Y passed (Y)
Duration    ~Zs
```

### Run Tests with Auto-Restart (Watch Mode)
```bash
npm test
```

Tests will automatically re-run when you modify source files.

### Run Tests with Coverage Report
```bash
npm run test:coverage
```

Coverage report opens in browser at `coverage/index.html`.

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
│   │   └── utils.test.ts
│   └── setup.ts                # Vitest setup
└── components/
    └── *.test.tsx              # Component tests inline
```

---

## Current Test Coverage

### Unit Tests (46 passing)

| File | Tests | Description |
|------|-------|-------------|
| `ratingFormula.test.ts` | 7 | Elo rating formula calculations |
| `newDay.test.ts` | 23 | Title progression and new day processing |
| `migration.test.ts` | 13 | Local ↔ Server data migration |
| `utils.test.ts` | 4 | Error message utilities |

### Component Tests

| File | Description |
|------|-------------|
| `LadderForm.test.tsx` | Component rendering tests |

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
- Title cycling through mini games
- Rating updates from nRating
- Game count recalculation
- Attendance tracking
- Optional re-ranking by rating

**Example:**
```typescript
import { getNextTitle } from '../../../src/utils/constants';

it('should progress from Kings_Cross to Pawn_Game', () => {
  expect(getNextTitle('Kings_Cross')).toBe('Pawn_Game');
});
```

### 3. Migration Tests
Tests local ↔ server data migration:
- Rank/name mismatch detection
- Player list merging strategies
- Non-result field preservation
- Game results merging

**Example:**
```typescript
import { detectRankNameMismatches } from '../../../src/utils/migrationUtils';

it('should detect mismatch when last names differ', () => {
  const localPlayers = [createPlayer({ rank: 1, lastName: 'Smith' })];
  const serverPlayers = [createPlayer({ rank: 1, lastName: 'Johnson' })];
  
  const result = detectRankNameMismatches(localPlayers, serverPlayers);
  expect(result.hasMismatch).toBe(true);
});
```

---

## Writing New Tests

### Unit Test Template
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

---

## Debugging Tests

### Run Single Test File
```bash
npm test src/test/unit/ratingFormula.test.ts
```

### Run Single Test
```bash
npm test -t "should return 0.5 when ratings are equal"
```

### Debug in VS Code
1. Set breakpoint in test file
2. Click debug icon next to test
3. Or use `console.log()` for simple debugging

---

## Test Configuration

- **Framework:** Vitest v4.x
- **Environment:** jsdom (browser simulation)
- **Setup File:** `src/test/setup.ts`
- **Config:** `vitest.config.ts`

---

## Test Best Practices

1. **Use `waitFor()`** for async operations (data loading, state updates)
2. **Prefer semantic queries**: `getByRole()`, `getByText()` over `query_selector`
3. **Test behavior, not implementation**: Focus on what users see/do
4. **Use descriptive test names**: `"should update rating when game is added"`

---

## Notes

- Tests run in **jsdom** environment (browser-like)
- Use `import.meta.env` for environment variables
- Mock external dependencies with `vi.mock()`
- Use `beforeEach`/`afterEach` for setup/teardown
