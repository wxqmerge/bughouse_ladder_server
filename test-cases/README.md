# Automated Test Suite

## Overview

This project uses **Vitest** for unit testing with **React Testing Library** for component tests. The test suite covers core functionality that was previously tested manually through `.tab` files.

---

## Quick Start

### Run All Tests
```bash
npm run test:run
```

Example output:
```
Test Files  5 passed | 1 failed (6)
     Tests  46 passed | 1 failed | 2 skipped (49)
```

### Interactive Mode (Watch)
```bash
npm test
```
Runs tests and automatically re-runs when files change.

### With Coverage Report
```bash
npm run test:coverage
```
Generates HTML coverage report in `coverage/` directory.

---

## Test Suite Structure

```
src/
├── test/
│   ├── fixtures/
│   │   └── players.ts              # Test data fixtures
│   ├── unit/                       # Unit tests
│   │   ├── ratingFormula.test.ts   # Elo formula tests (7 tests)
│   │   ├── newDay.test.ts          # Title & new day tests (23 tests)
│   │   ├── migration.test.ts       # Migration logic tests (13 tests)
│   │   └── utils.test.ts           # Utility tests (4 tests)
│   └── setup.ts                    # Vitest configuration
└── components/
    └── *.test.tsx                  # Component tests
```

---

## Test Categories

### 1. Rating Formula Tests (`ratingFormula.test.ts`)

Tests the Elo win probability formula.

**What's tested:**
- Equal ratings → 50% probability
- Higher rating → >50% probability
- Lower rating → <50% probability
- Extreme differences approach 0% or 100%

**Run only rating tests:**
```bash
npm test src/test/unit/ratingFormula.test.ts
```

### 2. New Day Tests (`newDay.test.ts`)

Tests title progression and player transformations.

**What's tested:**
- Title cycling: BG_Game → Bishop_Game → Pillar_Game → Kings_Cross → Pawn_Game → Queen_Game
- Rating updates from nRating
- Game count recalculation
- Attendance tracking
- Re-ranking by rating (optional)

**Run only new day tests:**
```bash
npm test src/test/unit/newDay.test.ts
```

### 3. Migration Tests (`migration.test.ts`)

Tests local ↔ server data migration logic.

**What's tested:**
- Rank/name mismatch detection
- Player list merging strategies (use-server, use-local)
- Game results merging vs. keeping server-only
- Preservation of all 13 non-result fields

**Run only migration tests:**
```bash
npm test src/test/unit/migration.test.ts
```

### 4. Utility Tests (`utils.test.ts`)

Tests error message utilities.

**What's tested:**
- Error code to message translation
- Unknown error handling

**Run only utility tests:**
```bash
npm test src/test/unit/utils.test.ts
```

---

## Running Specific Tests

### By Test File
```bash
npm test src/test/unit/ratingFormula.test.ts
```

### By Test Name Pattern
```bash
npm test -t "should return 0.5 when ratings are equal"
```

### By Directory
```bash
npm test src/test/unit/
```

---

## Test Fixtures

Test fixtures provide consistent sample data:

**Location:** `src/test/fixtures/players.ts`

**Available fixtures:**
- `kingsCrossPlayers` - Sample from original kings_cross.tab
- `simplePlayers` - Basic 2-player setup
- `playersWithResults` - Players with game results for testing

**Usage:**
```typescript
import { simplePlayers } from '../fixtures/players';

describe('My Test', () => {
  it('should work with fixtures', () => {
    expect(simplePlayers).toHaveLength(2);
  });
});
```

---

## Writing New Tests

### Unit Test Template
```typescript
// src/test/unit/myFeature.test.ts
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../../path/to/module';

describe('MyFeature', () => {
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
// src/components/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText(/expected text/i)).toBeInTheDocument();
  });
});
```

---

## Debugging Tests

### Verbose Output
```bash
npm test -- --reporter=verbose
```

### Debug Single Test in VS Code
1. Open test file
2. Click the "Debug" icon (▶️ with bug) next to test name
3. Set breakpoints as needed

### Console Logging
```typescript
it('should debug', () => {
  console.log('Debug info:', value);
  expect(true).toBe(true);
});
```

---

## CI Integration

Tests run automatically in CI pipeline.

**Passing criteria:**
- All unit tests must pass (46 tests)
- No unhandled errors in component tests
- Code coverage maintained above threshold

---

## Legacy Test Files

The `.json` and `.tab` files in this directory are **legacy manual test cases** from the previous VB6 implementation. They are kept for:

1. **Reference** - Understanding original test scenarios
2. **Data samples** - Source of test fixtures
3. **Historical record** - Documentation of tested features

These files are **not executed** by the automated test suite.

---

## Troubleshooting

### Tests Not Finding Modules
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors in Tests
```bash
# Check types
npm run typecheck
```

### Component Tests Failing Due to Timing
Use `waitFor` from @testing-library/react:
```typescript
import { waitFor } from '@testing-library/react';

await waitFor(() => {
  expect(screen.getByText(/loaded/i)).toBeInTheDocument();
});
```

---

## Test Summary

| Category | Tests | Status |
|----------|-------|--------|
| Rating Formula | 7 | ✅ Passing |
| New Day Processing | 23 | ✅ Passing |
| Migration Logic | 13 | ✅ Passing |
| Utilities | 4 | ✅ Passing |
| Components | 2 | ⚠️ Partial |
| **Total** | **49** | **46 passing** |

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
