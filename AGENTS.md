# Agent Instructions: Bughouse Chess Ladder

## Project Structure
- **Frontend (Root):** React/Vite SPA (Port 5173). Single-file build to `dist/`.
- **Backend (`server/`):** Node.js/Express API (Port 3000). Built to `server/dist/`.
- **Shared (`shared/`):** TypeScript types + utilities compiled separately. Consumed by both client and server.
- **Source of truth:** `server/data/ladder.tab` (gitignored).

## Developer Commands

### Convenience (Root Directory)
- `npm run dev:all`: Start both frontend and backend with hot-reload.
- `npm run build:all`: Build both frontend and server in one command.

### Frontend (Root Directory)
- `npm run dev`: Start Vite dev server. Proxies `/api`, `/health`, `/ladder/events` → `localhost:3000`.
- `npm run build`: 3-step pipeline — `compile-shared.js`, `tsc`, `vite build`. Typecheck must pass first. Also compiles `shared/` before frontend.
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
`shared/` has its own tsconfig. Both frontend and server builds compile it via `scripts/compile-shared.js` (copies .ts to temp dir, runs `tsc`, copies .js back). Generated `.js`, `.d.ts`, and `.d.ts.map` in `shared/` are gitignored. Do not edit files in `shared/dist/`.

### Dev Server Proxy
Vite proxies `/api`, `/health`, and `/ladder/events` → `http://localhost:3000`. Backend SSE endpoint is `/ladder/events` (proxied through Vite).

### Test Configuration
- **Framework:** Vitest (v4+), jsdom environment, globals enabled.
- **Setup file:** `src/test/setup.ts` (extends expect with jest-dom matchers, cleanup after each).
- **Frontend tests:** `src/test/unit/`, `src/test/shared/`.
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
- **Primary:** SSE (`EventSource` → `/ladder/events`) for instant push (<100ms).
- **Fallback:** Polling every 5.5s with overlap guard (skips if previous request pending).
- **Change detection:** Hash of game results compared against `lastDataHash`.

### Frontend Server Auto-Detect
When no manual server config exists, the app auto-detects from `window.location.origin`:
1. `GET /health` with 3s timeout
2. Responds → SERVER mode; fails → LOCAL mode (localStorage only)

### Frontend URL-Based Configuration
- `?config=1&server=URL&key=KEY`: Connect to server with API key.
- `?config=2`: Reset to LOCAL mode.
- `?config=3&file=URL`: Load remote `.tab`/`.xls` file.
- `?config=4`: Clear all game results, keep player data intact (confirm dialog, works in both LOCAL and SERVER mode).
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
- **Frontend build also compiles shared:** `npm run build` runs `compile-shared.js` first. Don't skip it.
- **`ladder.tab` is gitignored:** You must create or import data to test server-side features.
- **SSE events are broadcast to all connected clients** (writer receives their own event but filters it client-side).
- **"Push to Server" on reconnect does NOT fetch-merge-first** — use "Pull from Server" to avoid data loss.
- **Deploy script (`deploy/update.sh`)** requires passwordless sudo for `systemctl restart`. Has 7-day package cooldown (bypass with `--force` or `--force-critical` for 2-day). Auto-fixes nginx SSE config and systemd `EnvironmentFile`.

## Architecture Deep-Dive
See [ARCHITECTURE.md](./ARCHITECTURE.md) for multi-client sync details, data flow diagrams, SSE event types, merge algorithms, and performance notes.

## Add Player Flow
See [ADD_PLAYER_FLOW_TRACE.md](./ADD_PLAYER_FLOW_TRACE.md) for step-by-step console trace and implementation details of the Enter Games → Add Player flow.
