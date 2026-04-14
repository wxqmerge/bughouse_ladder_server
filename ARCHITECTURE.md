# Bughouse Chess Ladder - Architecture Documentation

## System Overview

A modern client-server reimplementation of the VB6 Bughouse Chess Ladder, featuring multi-client synchronization while maintaining compatibility with the original data format and business logic.

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (React)                        │
│                   Port: 5173 (dev), Static (prod)                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │   LadderForm    │  │    Settings     │  │   MenuBar       │   │
│  │   (Main UI)     │  │     Dialog      │  │                 │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
│           │                    │                     │            │
│           └────────────────────┼─────────────────────┘            │
│                                ▼                                  │
│                      ┌─────────────────┐                         │
│                      │  StorageService │                         │
│                      │  (Unified API)  │                         │
│                      └────────┬────────┘                         │
│                               │                                  │
│        ┌──────────────────────┼──────────────────────┐          │
│        ▼                      ▼                      ▼          │
│  ┌───────────┐        ┌───────────┐           ┌───────────┐    │
│  │ localStorage │      │ DataService │         │  Polling  │    │
│  │  (Offline)  │       │  (Server)  │          │ (Sync)    │    │
│  └───────────┘        └───────────┘           └───────────┘    │
│                                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │ HTTP/REST
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                       SERVER LAYER (Express)                       │
│                     Port: 3000 (configurable)                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   Auth      │  │   Ladder    │  │   Games     │                │
│  │ Middleware  │  │   Routes    │  │   Routes    │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│         └────────────────┼────────────────┘                        │
│                         ▼                                         │
│                  ┌───────────────┐                               │
│                  │  DataService  │                               │
│                  │  (File I/O)   │                               │
│                  └────────┬──────┘                               │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                    │
│         ▼                 ▼                 ▼                    │
│    ┌──────────┐     ┌──────────┐      ┌──────────┐              │
│    │  File    │     │  Hash    │      │  Tab     │              │
│    │  Locking │     │  Compare │      │  Format  │              │
│    └──────────┘     └──────────┘      └──────────┘              │
│                           │                                      │
│                           ▼                                      │
│                   data/ladder.tab                                │
│                  (Source of Truth)                               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Client-Side

#### LadderForm.tsx
**Purpose:** Main UI component displaying ladder grid and handling user interactions

**Key Responsibilities:**
- Render player rows and game result cells
- Handle cell edits via ErrorDialog
- Manage Enter Games mode state machine
- Coordinate recalculate_and_save operations
- Subscribe to data service changes for multi-client sync

**State Management:**
```typescript
interface LadderFormState {
  players: PlayerData[];           // Current ladder data
  entryCell: CellPosition | null;  // Currently edited cell
  isEnterGamesMode: boolean;       // Enter Games mode active?
  currentError: ValidationResult;  // Current error being corrected
  // ... additional state
}
```

#### StorageService.ts
**Purpose:** Unified data access layer supporting both localStorage and server modes

**Key Functions:**
```typescript
getPlayers(): Promise<PlayerData[]>      // Fetch from server or localStorage
savePlayers(players, waitForServer?): Promise<SaveResult>  // Save with optional sync wait
isCellSaved(rank, round): boolean        // Check save status for UI "_" suffix
markCellAsSaved(rank, round): void       // Mark cell as confirmed
```

**Mode Detection:**
- LOCAL: No server configured → localStorage only
- DEVELOPMENT: localhost server → client-server with caching
- SERVER: Production server → full client-server flow

#### DataService.ts
**Purpose:** Server communication and polling for multi-client sync

**Key Features:**
```typescript
startPolling(intervalMs): void    // Start 5-second polling loop
refreshData(): Promise<boolean>   // Fetch and detect changes via hash
subscribe(callback): Unsubscribe  // Subscribe to data changes
```

**Change Detection Algorithm:**
1. Fetch from server (cache only, no sync)
2. Compute hash of game results
3. Compare with last known hash
4. If changed → notify subscribers

### Server-Side

#### Ladder Routes (ladder.routes.ts)
**Purpose:** REST API for ladder data operations

**Endpoints:**
```typescript
GET    /api/ladder                          // Fetch all players
GET    /api/ladder/:rank                    // Fetch single player
PUT    /api/ladder                          // Bulk update (merge on client)
PUT    /api/ladder/:rank                    // Update single player
DELETE /api/ladder/:rank/round/:roundIndex  // Clear cell
```

#### DataService (server/src/services/dataService.ts)
**Purpose:** File I/O with locking for concurrent access safety

**Key Features:**
- File-based mutex for concurrent write protection
- Support for both VB6 ladder format and LadderForm format
- Hash computation for change detection

---

## Multi-Client Synchronization Architecture

### Problem Statement

Multiple users may edit the ladder simultaneously from different browsers. Requirements:
1. Changes visible to all clients within reasonable time (< 5 seconds)
2. No data loss when multiple clients save around same time
3. Graceful degradation when server is temporarily unavailable
4. Simple implementation (avoid WebSockets complexity)

### Solution Design

#### 1. Fetch-Before-Save Pattern

**Goal:** Prevent Browser B from overwriting Browser A's unsaved work

```
Browser A: Enters "4W5" (local state only, not yet saved)
Browser B: Wants to save "6W7"

WITHOUT fetch-before-save:
  Browser B saves → Server has only "6W7" → "4W5" LOST ❌

WITH fetch-before-save:
  Browser B fetches server (empty) → Merges with local (has "6W7")
  Browser B saves → Server has "6W7"
  Browser A saves → Fetches (has "6W7") → Merges with local (has "4W5")
  Browser A saves → Server has both "4W5" and "6W7" ✅
```

**Implementation in recalculateAndSave():**
```typescript
// Before processing:
const serverPlayers = await fetch('/api/ladder');
const playersToUse = mergeServerWithLocal(serverPlayers, players);

// Process with merged data...
// Save to server
```

#### 2. Polling with Change Detection

**Goal:** Browser B sees Browser A's changes without manual refresh

```
Every 5 seconds (in server mode):
  1. Fetch from server (cache-only, no sync triggered)
  2. Compute hash of game results
  3. If hash != lastHash:
       - Update lastHash
       - Notify subscribers via dataService.subscribe()
  4. Subscribers call refreshPlayers() → Update React state
```

**Change Detection:**
```typescript
private computeHash(players: PlayerData[]): string {
  return JSON.stringify(players.map(p => ({
    rank: p.rank,
    gameResults: p.gameResults
  })));
}
```

#### 3. Smart Merge Strategy

**Goal:** Preserve local work while integrating server changes

**Priority Order:**
1. **Local unconfirmed entries** (no "_" suffix) → PRESERVED
2. **Server confirmed entries** (has "_" suffix) → KEPT
3. **Pending deletes** → REAPPLIED

**Merge Algorithm:**
```typescript
for each player:
  for each round:
    if cell in pendingDeletes:
      merged[round] = ""  // Preserve delete
    else if local[round] exists AND not confirmed:
      merged[round] = local[round]  // Preserve local entry
    else if server[round] confirmed:
      merged[round] = server[round]  // Keep server confirmed
    // else: keep server value (default)
```

#### 4. Offline Resilience

**Goal:** Survive server downtime without data loss

**Mechanism:**
- **Game entries:** Saved to localStorage immediately, synced on next save
- **Deletes:** Queued in localStorage, retried on reconnect
- **Reconnect dialog:** Offers merge on both "Pull" and "Push" options

**Pending Deletes Queue:**
```typescript
// On delete:
queueDelete(rank, round) {
  adds to localStorage ladder_pending_deletes
  tries DELETE request (fire-and-forget)
}

// On reconnect or save:
replayPendingDeletes() {
  for each queued delete:
    fetch(`${serverUrl}/api/ladder/${rank}/round/${round}`, {method: 'DELETE'})
  clear queue
}
```

---

## Data Flow Diagrams

### Multi-Client Game Entry

```
┌──────────────────────────────────────────────────────────────────┐
│                    BROWSER A (Scorekeeper)                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User enters "4W5" in cell                                   │
│     → players[3].gameResults[0] = "4W5"                         │
│     → Opponent cell auto-filled: players[4].gameResults[0] = "4L5"
│                                                                  │
│  2. User clicks Save                                            │
│     → recalculateAndSave() called                               │
│                                                                  │
│  3. Fetch fresh data from server                                │
│     → GET /api/ladder                                           │
│     → Response: {players: [...]} (current server state)         │
│                                                                  │
│  4. Merge server + local                                        │
│     → mergeServerWithLocal(serverPlayers, players)              │
│     → Result: Server data + "4W5" preserved                     │
│                                                                  │
│  5. Process games, calculate ratings                            │
│     → checkGameErrors()                                         │
│     → repopulateGameResults()                                   │
│     → calculateRatings()                                        │
│                                                                  │
│  6. Save to server                                              │
│     → PUT /api/ladder {players: [...]}                          │
│     → Server writes to data/ladder.tab                          │
│     → Response: {success: true}                                 │
│                                                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             │ Server updated
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    BROWSER B (Tournament Director)               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [5 seconds later - polling interval]                           │
│                                                                  │
│  1. Polling fetches from server                                 │
│     → GET /api/ladder (cache-only)                              │
│     → Response includes "4W5"                                   │
│                                                                  │
│  2. Hash comparison                                             │
│     → newHash != lastHash                                       │
│     → Data changed!                                             │
│                                                                  │
│  3. Notify subscribers                                          │
│     → dataService.notifySubscribers()                           │
│     → App.tsx calls refreshPlayersRef.current()                │
│                                                                  │
│  4. Refresh UI                                                  │
│     → refreshPlayers() called                                   │
│     → GET /api/ladder                                           │
│     → setPlayers(freshData)                                     │
│     → React re-renders with "4W5" visible                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Reconnect Scenario

```
Timeline:
T0: Both browsers connected, ladder empty
T1: Server goes DOWN
T2: Browser A enters "4W5" (saved locally)
T3: Browser B enters "6W7" (saved locally)
T4: Server comes BACK UP
T5: ReconnectDialog appears in both browsers

Browser A clicks "Pull from Server":
  1. Replay pending deletes (none in this case)
  2. Fetch server data → Empty
  3. Get local data → Has "4W5"
  4. Merge → Result: "4W5"
  5. Save merged to server → ladder.tab has "4W5"
  6. Reload Browser A

Browser B clicks "Push to Server":
  1. Replay pending deletes (none)
  2. Get local data → Has "6W7"
  3. PUT to server → ladder.tab has "6W7" only ❌

WAIT! Browser B should FETCH FIRST too:
  Corrected flow for "Push":
  1. Fetch server → Has "4W5" (from Browser A)
  2. Get local → Has "6W7"
  3. Merge → Result: Both "4W5" and "6W7"
  4. PUT merged to server → ladder.tab has both ✅
```

---

## File Format Specifications

### ladder.tab (Source of Truth)

**VB6 Ladder Format (Original):**
```
Group	Last Name	First Name	Rating	Rnk	N Rate	Gr		X	Phone	Info	School	Room	1	2	...	31	Version 1.21
A1	Smith	John	1200	1	1250	1st		X	555-1234				4W5	6L7	...		
```

**LadderForm Format (New):**
```
Rnk	Group	Last Name	First Name	Prev Rating	New Rating	Gr	Gms	Attendance	Phone	Info
1	A1	Smith	John	1200	1250	1st	8	8	555-1234	
```

**Game Results Storage:**
- VB6 format: Tab-separated columns 1-31 after Room column
- LadderForm format: JSON in gameResults array per player
- Server converts between formats as needed

---

## Configuration Reference

### Polling Configuration

| Parameter | Default | Location | Description |
|-----------|---------|----------|-------------|
| Interval | 5000ms | App.tsx | Time between poll cycles |
| Hash algorithm | JSON.stringify | DataService.ts | Change detection method |
| Cache mode | true | storageService.ts | Poll fetch doesn't trigger sync |

### Merge Configuration

| Priority Level | Source | Condition |
|----------------|--------|------------|
| 1 (Highest) | Local unconfirmed | cell exists AND !endsWith('_') |
| 2 | Pending deletes | cell in getPendingDeletes() |
| 3 | Server confirmed | server cell endsWith('_') |
| 4 (Lowest) | Server default | fallback |

---

## Performance Considerations

### Polling Overhead

```
Assumptions:
- 10 concurrent users
- 50 players × 31 rounds = 1550 cells
- Average payload: ~50KB JSON

Calculation:
- Requests per minute: 10 users × 12 polls/min = 120 req/min
- Bandwidth: 120 × 50KB = 6MB/min = 360MB/hour
- Server load: Negligible (simple GET, file read)

Conclusion: Acceptable for < 50 concurrent users
```

### Change Detection Efficiency

```
Hash computation:
- Players: 50
- Game results: 31 each
- Operations: ~1550 string comparisons per poll
- Time: < 1ms (negligible)

Alternative considered: File modification timestamp
Rejection reason: Doesn't detect content changes, only file writes
```

---

## Future Enhancement Opportunities

### 1. WebSocket Real-Time Sync
**Benefit:** Instant updates (< 100ms latency)
**Tradeoff:** Complexity, reconnect handling, infrastructure requirements

### 2. Optimistic Locking
**Benefit:** True conflict detection for simultaneous edits
**Tradeoff:** User friction on conflicts

### 3. Differential Sync
**Benefit:** Only transfer changed cells
**Tradeoff:** Complex change tracking on both sides

### 4. Server-Sent Events (SSE)
**Benefit:** Push without WebSocket complexity
**Tradeoff:** One-way communication only

---

## Testing Recommendations

### Multi-Client Sync Tests

1. **Basic sync:** Browser A enters → Browser B sees within 5s
2. **Bidirectional sync:** Both enter different games → Both visible in both
3. **No unnecessary saves:** Wait 30s → Only GET requests, no PUT
4. **Persistence through polls:** Enter → Wait 15s → Still visible
5. **Reconnect merge:** Offline entry on both sides → Both preserved after reconnect

### Performance Tests

1. **Polling load:** 10 browsers × 1 hour → Monitor server CPU/memory
2. **Large ladder:** 200 players × 31 rounds → Measure poll response time
3. **Hash collision:** Verify hash uniqueness with different game result combinations

---

**Version:** 1.0  
**Last Updated:** April 2026  
**Author:** System
