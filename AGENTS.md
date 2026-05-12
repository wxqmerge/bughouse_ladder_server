# Agent Instructions: Bughouse Chess Ladder

## Project Structure
- **Frontend (Root):** React/Vite SPA (Port 5173). Built to `dist/` as a single file.
- **Backend (`server/`):** Node.js/Express API (Port 3000). Built to `server/dist/`.
- **Shared (`shared/`):** TypeScript types + utilities compiled separately. Consumed by both client and server.
- **Source of truth:** `server/data/ladder.tab` (excluded from git).

## Developer Commands

### Frontend (Root Directory)
- `npm run dev`: Start Vite dev server. Proxies `/api` requests to `localhost:3000`.
- `npm run build`: `tsc && vite build` (must run typecheck first).
- `npm run typecheck`: `tsc --noEmit` (root tsconfig includes `src` + `shared`).
- `npm run test`: Run Vitest in watch mode. Use `npm run test:run` for CI.

### Backend (`server/` Directory)
- `npm run dev`: `tsx watch src/index.ts` — hot-reload for development.
- `npm run build`: **CRITICAL** — 4-step pipeline:
  1. `scripts/compile-shared.js` — compiles `shared/` via its own tsconfig to `shared/dist/`
  2. `npx tsc` — compiles `server/src/` to `server/dist/`
  3. `scripts/patch-shared-imports.js` — rewrites `@shared/*` imports to relative `../../shared/dist/*` paths
  4. `scripts/flatten-server-dist.js` — flattens the server dist structure
  **Do NOT run `tsc` alone in `server/`** — it will fail on `@shared/*` imports.
- `npm run start`: `node dist/index.js` (production).
- `npm run typecheck`: `tsc --noEmit` (server tsconfig, separate from root).
- `npm run test:run`: `vitest run` (server tests).

## Key Technical Details

### TypeScript Path Aliases
- **Frontend:** `@/*` → `src/*` (root tsconfig + vite alias).
- **Server:** `@shared/*` → `../shared/*` (server tsconfig). At runtime, imports resolve to `shared/dist/*`.

### Shared Code Compilation
The `shared/` directory has its own tsconfig and is compiled to `shared/dist/` by the server build. Generated `.js`, `.d.ts`, and `.d.ts.map` files in `shared/` are gitignored. Do not edit files in `shared/dist/`.

### Dev Server Proxy
Vite proxies `/api` → `http://localhost:3000` (vite.config.ts). The backend SSE endpoint is `/api/ladder/events`.

### Test Configuration
- **Framework:** Vitest (v4+), jsdom environment, globals enabled.
- **Setup file:** `src/test/setup.ts`.
- **Frontend tests:** `src/test/unit/`, `src/test/shared/`, `src/test/fixtures/`.
- **Server tests:** `server/test/`.
- **Test pattern:** `**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}`.
- **Coverage:** `npm run test:coverage` (v8 provider, text/json/html reporters).

### Merge & Conflict Resolution (Client-Side)
Uses "Fetch-Before-Save" pattern. Merge priority (highest to lowest):
1. Local unconfirmed entries (cells without `_` suffix).
2. Pending deletes (queued in `localStorage` under `ladder_pending_deletes`).
3. Server confirmed entries (cells with `_` suffix).
4. Server default.

### Sync Strategy
- **Primary:** SSE (`EventSource` → `/api/ladder/events`) for instant push (<100ms).
- **Fallback:** Polling every 5.5s with overlap guard (skips if previous request pending).
- **Change detection:** Hash of game results compared against `lastDataHash`.

## Configuration

### Environment (Backend)
- Copy `server/.env.example` → `server/.env`.
- Required keys: `PORT`, `ADMIN_API_KEY`, `CORS_ORIGIN`, `TAB_FILE_PATH`.
- `.env` is gitignored. Never commit.

### Frontend URL-Based Configuration
- `?config=1&server=URL&key=KEY`: Connect to server with API key (overrides auto-detection).
- `?config=2`: Reset to LOCAL mode (localStorage only).
- `?config=3&file=URL`: Load remote `.tab`/`.xls` file.
- URL params are cleared via `history.replaceState` after applying.

### Auto-Detect Server URL
When no manual server config exists, the app auto-detects the server from `window.location.origin`:
1. Tries `HEAD /api/ladder` with 3s timeout
2. If server responds → saves origin to localStorage, enters SERVER mode
3. If failed → falls back to LOCAL mode
4. Works because frontend and backend share the same origin per subdomain (nginx proxy)
5. Splash screen and Settings dialog pre-populate with current origin

### Drag & Drop
`.tab`, `.xls`, or `.txt` files can be dropped on the splash screen to load locally (no server needed).

## Architecture Deep-Dive
See [ARCHITECTURE.md](./ARCHITECTURE.md) for multi-client sync details, data flow diagrams, SSE event types, merge algorithms, and performance notes.

## Documentation Index
| File | Purpose |
|------|---------|
| [README.md](./README.md) | Quick start, API endpoints, features |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical deep-dive, sync design, data flow |
| [README_INSTALL.md](./README_INSTALL.md) | Production deployment (nginx, systemd) |
| [USER_MANUAL.md](./USER_MANUAL.md) | End-user game entry guide |
| [ADMIN_MANUAL.md](./ADMIN_MANUAL.md) | Admin operations, backups, troubleshooting |
| [SECURITY.md](./SECURITY.md) | API keys, CORS, rate limiting |
| [TESTS.md](./TESTS.md) | Test suite documentation |

## Deployment
- **Server deploy:** `deploy/update.sh` — git pull, clean artifacts, `npm install`, frontend build, server build, systemctl restart. Requires passwordless sudo for `systemctl restart`.

## Gotchas
- **Server build order matters:** Always use `npm run build` in `server/`, never `tsc` alone.
- **`ladder.tab` is gitignored:** You must create or import data to test server-side features.
- **Frontend `npm run build` requires successful `tsc` first:** If typecheck fails, the build aborts.
- **SSE events are broadcast to all connected clients** (writer receives their own event but filters it client-side).
- **"Push to Server" on reconnect does NOT fetch-merge-first** — use "Pull from Server" to avoid data loss.
