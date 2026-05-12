# Agent Instructions: Bughouse Chess Ladder

## Project Structure
- **Frontend (Root):** React/Vite SPA (Port 5173). Single-file build to `dist/`.
- **Backend (`server/`):** Node.js/Express API (Port 3000). Built to `server/dist/`.
- **Shared (`shared/`):** TypeScript types + utilities compiled separately. Consumed by both client and server.
- **Source of truth:** `server/data/ladder.tab` (excluded from git).

## Developer Commands

### Frontend (Root Directory)
- `npm run dev`: Start Vite dev server. Proxies `/api` → `localhost:3000`.
- `npm run build`: `tsc && vite build` — typecheck must pass first.
- `npm run typecheck`: `tsc --noEmit` (root tsconfig includes `src` + `shared`).
- `npm run test`: Vitest watch mode. `npm run test:run` for CI. `npm run test:coverage` for coverage.

### Backend (`server/` Directory)
- `npm run dev`: `tsx watch src/index.ts` — hot-reload.
- `npm run build`: **CRITICAL** — 4-step pipeline:
  1. `scripts/compile-shared.js` — compiles `shared/` to `shared/dist/`
  2. `npx tsc` — compiles `server/src/` to `server/dist/`
  3. `scripts/patch-shared-imports.js` — rewrites `@shared/*` imports to relative paths
  4. `scripts/flatten-server-dist.js` — flattens server dist structure
  **Never run `tsc` alone in `server/`** — it will fail on `@shared/*` imports.
- `npm run start`: `node dist/index.js` (production).
- `npm run typecheck`: `tsc --noEmit` (server tsconfig, separate from root).
- `npm run test:run`: `vitest run`.

## Key Technical Details

### TypeScript Path Aliases
- **Frontend:** `@/*` → `src/*` (root tsconfig + vite alias).
- **Server:** `@shared/*` → `../shared/*` (server tsconfig). At runtime, imports resolve to `shared/dist/*`.

### Shared Code Compilation
`shared/` has its own tsconfig. The server build compiles it via `scripts/compile-shared.js` (copies .ts to temp dir, runs `tsc`, copies .js back). Generated `.js`, `.d.ts`, and `.d.ts.map` in `shared/` are gitignored. Do not edit files in `shared/dist/`.

### Dev Server Proxy
Vite proxies `/api` → `http://localhost:3000`. Backend SSE endpoint is `/api/ladder/events`.

### Test Configuration
- **Framework:** Vitest (v4+), jsdom environment, globals enabled.
- **Setup file:** `src/test/setup.ts`.
- **Frontend tests:** `src/test/unit/`, `src/test/shared/`, `src/test/fixtures/`.
- **Server tests:** `server/test/`.
- **Test pattern:** `**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}`.
- **Coverage:** `npm run test:coverage` (v8 provider, text/json/html reporters).

### Merge & Conflict Resolution (Client-Side)
"Fetch-Before-Save" pattern. Merge priority (highest to lowest):
1. Local unconfirmed entries (cells without `_` suffix).
2. Pending deletes (queued in `localStorage` under `ladder_pending_deletes`).
3. Server confirmed entries (cells with `_` suffix).
4. Server default.

### Sync Strategy
- **Primary:** SSE (`EventSource` → `/api/ladder/events`) for instant push (<100ms).
- **Fallback:** Polling every 5.5s with overlap guard (skips if previous request pending).
- **Change detection:** Hash of game results compared against `lastDataHash`.

### Frontend Server Auto-Detect
When no manual server config exists, the app auto-detects from `window.location.origin`:
1. `HEAD /api/ladder` with 3s timeout
2. Responds → SERVER mode; fails → LOCAL mode (localStorage only)

### Frontend URL-Based Configuration
- `?config=1&server=URL&key=KEY`: Connect to server with API key.
- `?config=2`: Reset to LOCAL mode.
- `?config=3&file=URL`: Load remote `.tab`/`.xls` file.
- URL params are cleared via `history.replaceState` after applying.
- `.tab`, `.xls`, or `.txt` files can be dropped on the splash screen to load locally.

## Configuration

### Environment (Backend)
- Copy `server/.env.example` → `server/.env`.
- Required keys: `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `ADMIN_API_KEY`, `USER_API_KEY`, `TAB_FILE_PATH`.
- `.env` is gitignored. Never commit.
- `ADMIN_API_KEY` protects `/api/admin/*`. `USER_API_KEY` protects write operations (PUT/DELETE on ladder, POST on games).

## Gotchas
- **Server build order matters:** Always use `npm run build` in `server/`, never `tsc` alone.
- **`ladder.tab` is gitignored:** You must create or import data to test server-side features.
- **Frontend `npm run build` requires successful `tsc` first:** If typecheck fails, the build aborts.
- **SSE events are broadcast to all connected clients** (writer receives their own event but filters it client-side).
- **"Push to Server" on reconnect does NOT fetch-merge-first** — use "Pull from Server" to avoid data loss.
- **Deploy script (`deploy/update.sh`)** requires passwordless sudo for `systemctl restart`. It stashes local changes, pulls, cleans artifacts, builds both frontend and server, then restarts.

## Architecture Deep-Dive
See [ARCHITECTURE.md](./ARCHITECTURE.md) for multi-client sync details, data flow diagrams, SSE event types, merge algorithms, and performance notes.
