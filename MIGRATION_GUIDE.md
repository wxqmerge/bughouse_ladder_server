# Client-Server Migration Guide

## Current State

**Last Updated**: April 10, 2026

The codebase has been scaffolded with a client-server architecture. Phase 1 & 2 of the migration are **COMPLETE**.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                        │
├─────────────────────────────────────────────────────────────┤
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

Shared Module (both client and server):
├── types/     - TypeScript interfaces
└── utils/     - Game processing logic
```

## Migration Strategy

### Phase 1: Wrap localStorage Access (Non-Breaking) ✅ **COMPLETE**

Created helper functions in `src/services/storageService.ts` that wrap localStorage but can be redirected later.

### Phase 2: Integrate DataService ✅ **COMPLETE**

Updated the helper functions to use DataService based on mode:

```typescript
// src/services/storageService.ts
import { dataService, DataServiceMode } from './dataService';

export async function getPlayers(): Promise<PlayerData[]> {
  if (dataService.getMode() === DataServiceMode.LOCAL) {
    // Use localStorage
    return localStorage.getItem('ladder_players') ? 
      JSON.parse(localStorage.getItem('ladder_players')!) : [];
  } else {
    // Use API
    return dataService.getPlayers();
  }
}
```

### Phase 3: Update Components ✅ **COMPLETE**

Replaced direct localStorage calls with the helper functions:

```typescript
// Before:
const players = JSON.parse(localStorage.getItem('ladder_players') || '[]');

// After:
const players = await getPlayers();
```

## Files Migration Status

| File | Before | After | Status |
\|------\|--------\|-------\|--------\|
| `src/components/LadderForm.tsx` | 38 | 12 | ✅ Migrated (-26) |
| `src/App.tsx` | 9 | 3 | ✅ Migrated (-6) |
| `src/components/Settings.tsx` | 3 | 2 | ✅ Migrated (-1) |
| `src/contexts/SettingsContext.tsx` | 7 | 7 | ⏸️ UI preferences (OK) |

**Total: 57 → 24 localStorage calls (33 migrated to storageService)**

### Remaining localStorage Usage (Intentional)

1. **File Loading Operations** (`LadderForm.tsx`): File-based imports bypass server
2. **New Day Pending Flag** (`App.tsx`, `LadderForm.tsx`): Transient cross-component state
3. **UI Preferences** (`SettingsContext.tsx`): Mode, server URL, auth token
4. **App Settings** (`Settings.tsx`): Debug level, k-factor configuration

## Quick Start for Testing Server

### 1. Start the Backend
```bash
cd server
npm install
cp .env.example .env
npm run dev
```
Server runs on http://localhost:3000

### 2. Test Authentication
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 3. Test Ladder API
```bash
curl http://localhost:3000/api/ladder
```

## Verification Checklist

### Code Migration
- [x] storageService.ts created with mode-aware routing
- [x] LadderForm.tsx migrated to use storageService
- [x] App.tsx migrated to use storageService
- [x] Settings.tsx updated for consistency

### Runtime Testing (Pending)
- [ ] Backend server starts without errors
- [ ] Authentication endpoints work (login/register)
- [ ] Ladder data can be read/written via API
- [ ] Frontend can switch to DEVELOPMENT mode
- [ ] DataService correctly routes to API in server modes
- [ ] File locking prevents concurrent write conflicts
- [ ] Game submission works through API
- [ ] Admin endpoints require proper authentication

## Notes

- **Backward Compatibility**: LOCAL mode ensures existing functionality works
- **Gradual Migration**: Can migrate components one at a time
- **Testing**: Test each mode independently before integration
