# Fix: Request Storm When Switching to New Mini-Game

## Problem

When switching to a new mini-game file in SERVER mode, multiple concurrent HTTP requests are sent to the same endpoint, causing a request storm.

### Request Flow

1. `checkMiniGameFiles()` → HTTP GET `/api/admin/tournament/check-mini-games`
2. `copyPlayersToMiniGame()` → HTTP POST `/api/admin/tournament/copy-players` → broadcasts `playersCopied` SSE event
3. `setMiniGameFile(fileName)` → sets `currentMiniGameFile`
4. `refreshPlayers()` → `getPlayers()`:
   - Returns cached data immediately
   - Starts background fetch: `fetchMiniGamePlayers()` → HTTP GET `/api/admin/tournament/read-mini-game`
5. SSE `playersCopied` fires → `notifySubscribers()` → `refreshPlayers()` → `getPlayers()`:
   - Returns cached data again
   - Starts **another** background fetch to the same endpoint!

**Result:** 2+ concurrent HTTP requests to the same `read-mini-game` endpoint.

## Root Cause

`DataService.getPlayers()` in SERVER mode always starts a background fetch without checking if one is already in progress. The dedup mechanism that exists for polling (`isPolling`) is not applied to the `getPlayers()` background fetch.

## Fix

Add a `pendingRefresh` flag to `DataService` that prevents duplicate background fetches in `getPlayers()`.

### Changes to `src/services/dataService.ts`

**1. Add the flag (line ~37):**
```typescript
private pendingRefresh = false;
```

**2. Wrap the background fetch in `getPlayers()` (lines 331-349):**
```typescript
// Fetch from server in background to sync (deduplicated)
if (!this.pendingRefresh) {
  this.pendingRefresh = true;
  (async () => {
    try {
      let serverPlayers: PlayerData[];
      if (this.currentMiniGameFile) {
        serverPlayers = await this.fetchMiniGamePlayers();
      } else {
        serverPlayers = await this.fetchPlayers();
      }
      // Initialize hash on first fetch
      if (this.lastDataHash === null && serverPlayers.length > 0) {
        this.lastDataHash = this.computeHash(serverPlayers);
      }
      // Notify subscribers so refreshPlayers picks up the synced data
      this.notifySubscribers();
    } catch {
      // Server fetch failed silently — UI keeps showing cached local data
    } finally {
      this.pendingRefresh = false;
    }
  })();
}
```

### How it works

- First call to `getPlayers()` sets `pendingRefresh = true` and starts the fetch
- Second call (triggered by SSE event) sees `pendingRefresh = true` and skips the fetch
- When the first fetch completes (success or failure), `pendingRefresh` is reset to `false` in the `finally` block
- Subsequent calls will start a new fetch if needed

This is the same pattern already used for polling (`isPolling` flag at line 66-70).
