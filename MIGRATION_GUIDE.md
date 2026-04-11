# Client-Server Migration Guide

## Current State

The codebase has been scaffolded with a client-server architecture, but the React frontend still uses `localStorage` directly throughout.

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

### Phase 1: Wrap localStorage Access (Non-Breaking)

Create helper functions that wrap localStorage but can be redirected later:

```typescript
// src/services/storageService.ts
export function getPlayers(): PlayerData[] {
  const data = localStorage.getItem('ladder_players');
  return data ? JSON.parse(data) : [];
}

export function savePlayers(players: PlayerData[]): void {
  localStorage.setItem('ladder_players', JSON.stringify(players));
}
```

### Phase 2: Integrate DataService

Update the helper functions to use DataService based on mode:

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

### Phase 3: Update Components

Replace direct localStorage calls with the helper functions:

```typescript
// Before:
const players = JSON.parse(localStorage.getItem('ladder_players') || '[]');

// After:
const players = await getPlayers();
```

## Files to Update (Priority Order)

### High Priority (Core Functionality)
1. `src/components/LadderForm.tsx` - Main component, most localStorage usage
2. `src/App.tsx` - App-level state management
3. `src/components/Settings.tsx` - Settings and New Day logic

### Medium Priority
4. `src/components/LadderForm.tsx` - Game result submission
5. `src/components/AddPlayerDialog.tsx` - Player addition

### Low Priority (Can stay localStorage)
6. UI preferences (zoom level, project name, etc.)

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
