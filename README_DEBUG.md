# 🐛 Bughouse Ladder - Debug & Testing Guide

## Overview

This guide provides comprehensive instructions for running the Bughouse Chess Ladder application in all three data access modes.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                        │
│                  Port: 5173                                 │
│              http://localhost:5173                          │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  SettingsContext │  │    DataService   │                │
│  │  (Mode Config)   │  │  (Data Access)   │                │
│  └────────┬─────────┘  └─────────┬────────┘                │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      ▼                                     │
│              ┌───────────────┐                            │
│              │  Components   │                            │
│              │ (LadderForm)  │                            │
│              └───────────────┘                            │
└────────────────────┬──────────────────────────────────────┘
                     │ HTTP/REST
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Express)                        │
│                   Port: 3000                                │
│              http://localhost:3000                          │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Auth     │  │  Ladder    │  │   Games    │            │
│  │  Routes    │  │  Routes    │  │  Routes    │            │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘            │
│         │               │               │                   │
│         └───────────────┼───────────────┘                   │
│                         ▼                                   │
│                  ┌─────────────┐                           │
│                  │ DataService │                           │
│                  │  (File I/O) │                           │
│                  └────────┬────┘                           │
│                           │                                │
│                           ▼                                │
│                    data/ladder.tab                         │
└────────────────────────────────────────────────────────────┘
```

---

## Data Service Modes

### Mode 1: LOCAL (localStorage) ✅ No Server Required

**Best for:** Quick testing, offline development, debugging UI

#### Setup Instructions:

**No server setup needed!** Just start the frontend.

```powershell
# Terminal 1: Frontend only
cd D:\xampp\htdocs\bughouse_ladder_server
npm run dev
```

**Access:** http://localhost:5173

#### Verification:

1. **Open Browser DevTools** (F12)
2. **Go to Application → Local Storage**
3. **Check for these keys:**
   - `ladder_players` - Player data array
   - `ladder_project_name` - Current project name
   - `ladder_zoom` - Zoom level setting
   - `ladder_settings` - App settings

#### Test Commands:

```javascript
// In browser console:
localStorage.getItem('ladder_players'); // View players
JSON.parse(localStorage.getItem('ladder_players')).length; // Player count
```

---

### Mode 2: DEVELOPMENT (Client-Server) 🔄 Full Stack

**Best for:** Testing full client-server integration, API debugging

#### Setup Instructions:

**Terminal 1: Backend Server**
```powershell
cd D:\xampp\htdocs\bughouse_ladder_server\server
npm run dev
```

Expected output:
```
Created default ladder file at D:\xampp\htdocs\bughouse_ladder_server\data\ladder.tab
Server running on port 3000
Environment: development
```

**Terminal 2: Frontend**
```powershell
cd D:\xampp\htdocs\bughouse_ladder_server
npm run dev
```

Expected output:
```
VITE v5.x.x ready in xxxx ms
➜  Local:   http://localhost:5173/
```

#### Switch to DEVELOPMENT Mode:

1. Open http://localhost:5173
2. **Open Settings** (gear icon)
3. **Change Data Mode** to "Development (localhost)"
4. **Server URL:** `http://localhost:3000`

#### Verification:

**Backend Health Check:**
```powershell
curl http://localhost:3000/health
```
Expected:
```json
{"status":"ok","timestamp":"2026-04-10T..."}
```

**Ladder API:**
```powershell
curl http://localhost:3000/api/ladder
```
Expected:
```json
{
  "header": ["Group", "Last Name", ...],
  "players": [],
  "rawLines": []
}
```

**Check Network Tab (F12 → Network):**
- Look for requests to `/api/ladder`
- Requests should proxy through Vite to `localhost:3000`

#### Debug Tips:

```powershell
# Check if ports are in use
netstat -ano | findstr :3000
netstat -ano | findstr :5173

# Kill processes on specific ports
# (Replace PID with actual process ID)
taskkill /PID <PID> /F
```

---

### Mode 3: SERVER (Production) 🌐 External Server

**Best for:** Testing with remote server, production simulation

#### Setup Instructions:

**Terminal 1: Backend (Same as Development)**
```powershell
cd D:\xampp\htdocs\bughouse_ladder_server\server
npm run dev
```

**Terminal 2: Frontend (Same as Development)**
```powershell
cd D:\xampp\htdocs\bughouse_ladder_server
npm run dev
```

#### Switch to SERVER Mode:

1. Open http://localhost:5173
2. **Open Settings** (gear icon)
3. **Change Data Mode** to "Server"
4. **Server URL:** `http://localhost:3000` (or actual server URL)

#### Verification:

Same as DEVELOPMENT mode, but with different routing logic in DataService.

---

## Unit Tests

### Test Suite Overview

The project uses **Vitest** with **React Testing Library** for unit testing.

| Test File | Purpose | Tests |
|-----------|---------|-------|
| `src/test/simple.test.ts` | Basic sanity test | 1 |
| `src/components/LadderForm.test.tsx` | Component rendering tests | 3 |

### Running Tests

**Run all tests once (CI mode):**
```powershell
cd D:\xampp\htdocs\bughouse_ladder_server
npm run test:run
```

Expected output:
```
Test Files  2 passed (2)
 Tests      4 passed (4)
Duration    ~1.2s
```

**Run tests with auto-restart (watch mode):**
```powershell
npm run test
```

Tests will automatically re-run when you modify source files.

**Run tests with coverage report:**
```powershell
npm run test:coverage
```

Coverage report opens in browser at `coverage/index.html`.

### Test Configuration

- **Framework:** Vitest v4.x
- **Environment:** jsdom (browser simulation)
- **Setup File:** `src/test/setup.ts`
- **Config:** `vitest.config.ts`

### Current Test Coverage

```typescript
// src/test/simple.test.ts
describe("Basic tests", () => {
  it("should work", () => {
    expect(1 + 1).toBe(2);
  });
});

// src/components/LadderForm.test.tsx
describe("LadderForm component", () => {
  it("should render the title", async () => { ... });
  it("should load sample data on mount", async () => { ... });
  it("should display players after loading", async () => { ... });
});
```

### Writing New Tests

**Example: Component Test**
```typescript
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import MyComponent from "./MyComponent";

describe("MyComponent", () => {
  it("should render correctly", async () => {
    render(<MyComponent />);
    await waitFor(() => {
      expect(screen.getByText(/expected text/i)).toBeInTheDocument();
    });
  });
});
```

**Example: Utility Function Test**
```typescript
import { describe, it, expect } from "vitest";
import { calculateRatings } from "../utils/hashUtils";

describe("calculateRatings", () => {
  it("should calculate ratings correctly", () => {
    const players = [{ rank: 1, rating: 1200 }];
    const matches = [];
    const result = calculateRatings(players, matches);
    expect(result[0].nRating).toBeDefined();
  });
});
```

### Test Best Practices

1. **Use `waitFor()`** for async operations (data loading, state updates)
2. **Prefer semantic queries**: `getByRole()`, `getByText()` over `query_selector`
3. **Test behavior, not implementation**: Focus on what users see/do
4. **Use descriptive test names**: `"should update rating when game is added"`

---

## Quick Test Scenarios

### Scenario 1: Add Player via UI (LOCAL Mode)

1. Start frontend only: `npm run dev`
2. Open http://localhost:5173
3. Click **Menu → Add Player**
4. Fill in player details
5. Click **Add**
6. Verify in browser console:
   ```javascript
   JSON.parse(localStorage.getItem('ladder_players')).length
   // Should return 1 (or count + 1)
   ```

### Scenario 2: API Call Test (DEVELOPMENT Mode)

```powershell
# Start both servers first!

# Get ladder data
curl http://localhost:3000/api/ladder

# Check server logs for the request
# Should see: GET /api/ladder 200
```

### Scenario 3: Mode Switching

1. Start in **LOCAL mode**
2. Add a player via UI
3. Verify player exists (check localStorage)
4. Switch to **DEVELOPMENT mode**
5. Player list should be empty (server has no data yet)
6. This confirms modes use separate storage!

---

## Common Issues & Solutions

### Issue 1: "Port 3000 already in use"

```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### Issue 2: "Cannot connect to localhost:3000"

1. Verify backend is running:
   ```powershell
   curl http://localhost:3000/health
   ```
2. Check backend console for errors
3. Ensure `.env` file exists in `server/` directory

### Issue 3: CORS Errors

The Vite dev server should proxy all `/api/*` requests automatically.

If you see CORS errors:
1. Check `vite.config.ts` has proxy configuration
2. Verify backend has CORS enabled (`cors()` middleware)

### Issue 4: TypeScript Errors in Console

These are typically warnings and don't affect runtime. To fix:
```powershell
npm run typecheck
```

---

## Debugging Checklist

### Before Starting:
- [ ] Node.js installed (v18+)
- [ ] Dependencies installed (`npm install` in both root and `server/`)
- [ ] No processes on ports 3000 and 5173

### Tests:
- [ ] All tests pass: `npm run test:run`
- [ ] Expected output: `Test Files  2 passed (2)`
- [ ] Expected output: `Tests      4 passed (4)`

### LOCAL Mode:
- [ ] Frontend running on port 5173
- [ ] Browser can access http://localhost:5173
- [ ] localStorage contains `ladder_players`

### DEVELOPMENT/SERVER Mode:
- [ ] Backend running on port 3000
- [ ] Frontend running on port 5173
- [ ] Health check passes: `curl http://localhost:3000/health`
- [ ] API accessible: `curl http://localhost:3000/api/ladder`
- [ ] Mode selector shows correct mode
- [ ] Network tab shows requests to `/api/*`

---

## Environment Variables

### Frontend (`.env` in root):
```bash
VITE_API_URL=http://localhost:3000
```

### Backend (`.env` in `server/`):
```bash
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5173
TAB_FILE_PATH=./data/ladder.tab
```

---

## Files to Monitor for Debugging

| File | Purpose |
|------|---------|
| `src/services/dataService.ts` | Data routing logic |
| `src/services/storageService.ts` | Storage abstraction layer |
| `src/contexts/SettingsContext.tsx` | Mode configuration |
| `server/src/services/dataService.ts` | Backend file I/O |

---

## Quick Reference Commands

```powershell
# ==================== DEVELOPMENT ====================

# Start frontend only (LOCAL mode)
cd D:\xampp\htdocs\bughouse_ladder_server
npm run dev

# Start backend server
cd D:\xampp\htdocs\bughouse_ladder_server\server
npm run dev

# ==================== TESTING ====================

# Run all tests once
npm run test:run

# Run tests with watch mode
npm run test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# ==================== API TESTS ====================

# Health check
curl http://localhost:3000/health

# Get ladder data
curl http://localhost:3000/api/ladder

# ==================== SYSTEM ====================

# Check running processes
Get-Process node | Select-Object Id, ProcessName, WorkingSet

# Kill all Node processes
Stop-Process -Name node -Force
```

---

## Migration Status

### Phase 1 & 2: ✅ COMPLETE
- storageService.ts created
- DataService integration working
- Mode switching functional

### Phase 3: ✅ COMPLETE
- LadderForm.tsx migrated (38 → 12 localStorage calls)
- App.tsx migrated (9 → 3 localStorage calls)
- Settings.tsx updated

---

## Next Steps for Full Testing

1. [ ] Test player addition in all three modes
2. [ ] Test game result submission via API
3. [ ] Test authentication endpoints
4. [ ] Test file upload functionality
5. [ ] Verify data persistence across sessions

---

**Last Updated:** April 11, 2026
