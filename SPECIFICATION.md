# Specification: Bughouse Chess Ladder System

## 1. System Overview

The Bughouse Chess Ladder is a web application for managing Elo ratings in bughouse chess games — a format where each player is paired with a teammate (side) and games involve two teams of two players each. The system tracks player identities, ratings, game results across 31 rounds, and produces trophy reports and activity reports. It supports both offline standalone use (localStorage-only) and multi-client collaborative use over a central server with real-time push updates.

**Primary use cases:**

- As a scorekeeper I want to enter game results into the ladder so that players' ratings are calculated automatically.
- As a tournament director I want to see changes made by other scorekeepers in real time so that the ladder stays consistent.
- As an admin I want to import/export ladder data and manage player identities across multiple mini-game files so that tournament history is preserved.
- As a player I want my name, rank, and rating to be accurate so that trophies and standings are correct.

**High-level architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React SPA, port 5173 dev / static in prod)            │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────────────────┐ │
│  │ Ladder UI │  │ Settings  │  │ DataService (fetch/poll/SSE)│ │
│  └─────┬─────┘  └─────┬─────┘  └──────────────┬──────────────┘ │
│        │              │                       │                │
│        └──────────────┴───────────────────────┘                │
│                              │ HTTP/REST + SSE                 │
└──────────────────────────────┼─────────────────────────────────┘
                               │
┌──────────────────────────────┼─────────────────────────────────┐
│  Node/Express backend (port 3000)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ Ladder   │  │ Games    │  │ Admin    │  │ SSE broadcast  │ │
│  │ Routes   │  │ Routes   │  │ Routes   │  │ (EventSource)  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬────────┘ │
│       │             │             │                │          │
│       └─────────────┴─────────────┴────────────────┘          │
│                             │                                  │
│                    ┌────────┴────────┐                        │
│                    │ File I/O layer  │                        │
│                    │ ladder.tab      │                        │
│                    └─────────────────┘                        │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Functional Requirements

### 2.1 Player Management

**Purpose:** Create, read, update, and delete player records with identity fields (name, rank, group, phone, school, room, info).

**Inputs:**
- Player object with fields: `rank` (number), `group` (string), `lastName`, `firstName`, `rating`, `nRating`, `trophyEligible` (boolean), `grade`, `num_games`, `attendance`, `info`, `phone`, `school`, `room`, `gameResults` (array of 31 strings or null).
- Auth: write operations require a `X-API-Key` header (user key or admin key). Read operations are public.

**Outputs:**
- Players list (GET), single player (GET), bulk update (PUT), single update (PUT), delete (DELETE).

**Success criteria:**
- GET `/api/ladder` returns all players with their full records.
- PUT `/api/ladder` writes all players to `ladder.tab`; subsequent GET returns the same data.
- DELETE `/api/ladder/:rank/round/:roundIndex` removes a specific game result cell.

**Critical to preserve:**
- Identity fields (name, rank, group) must be reconciled across mini-game files and the club ladder (see §2.4).

**Technical debt / accidental:**
- `trophyEligible` is now user-selectable (was previously hardcoded `true`). Behavior is intentional.

---

### 2.2 Game Result Entry

**Purpose:** Enter a game result string (e.g. "4W5", "4:3W2:5") for a specific player and round; the system parses it, validates it, and produces a match entry that is distributed to all involved players' game result cells.

**Inputs:**
- A result string of the form `R1[R2][W|L|D|O][R3:R4][S]` where:
  - `R1..R4` are player ranks (1–200).
  - `W/L/D/O` are score letters (Win / Loss / Draw / Omit).
  - A colon (`:`) between two ranks signals a 4-player (team) game.
  - A second score letter after the first is allowed (dual result, e.g. "4W5" means both pair members win).
- The cell position (player rank + round index 0–30).

**Outputs:**
- Validation result (error codes: incomplete entry, invalid format, self-play, duplicate ranks, missing result, too many results, incomplete 4-player, incomplete 2-player, rank > 200).
- Match object with `player1, player2, player3, player4, score1, score2, side0Won`.
- Game result strings written into each involved player's `gameResults` array.

**Success criteria:**
- "4W5" parses to player1=4, player2=5, score1=Win, side0Won=true.
- "4:3W2:5" parses to 4-player game with both scores.
- "4:3W2:5W" is rejected (too many results for 4-player).
- "2w3w" is rejected (second score after second player in 2-player game).

**Critical to preserve:**
- Result string format is the single source of truth for game data; all downstream logic (rating calc, trophy report, activity report) derives from parsed game results.

**Adjustable:**
- The "underscore suffix" (`_`) on game results is a client-side convention indicating "cell is saved/unconfirmed" — not part of the data model.

---

### 2.3 Rating Calculation

**Purpose:** Compute Elo-style ratings from game results. The formula branches:
- **≥10 games (ELO formula):** `newRating = currentRating + K × (actual - expected)`, where `expected = 1/(1 + 10^((|opponent| − |myRating|) / 400))`.
- **<10 games (BLending formula):** `newRating = (currentRating × numGames × blendFactor + opposingPerfRating) / (numGames + 1)`, where `opposingPerfRating = ownRating + multiplier × (WLD perfs)`.

**Multiplier:** 400 × perfMultiplierScale for 2-player, 200 for 4-player.

**Double-pass averaging:** Pass 1 computes nRating from original state; Pass 2 feeds Pass 1's nRating back in (affects num_games=0 players whose init becomes capped at 1800). Final nRating = round((pass1 + pass2) / 2).

**Success criteria:**
- A player with ≥10 games gets a standard Elo adjustment.
- A player with <10 games gets a blended rating that converges toward their actual performance.
- A player who did not play gets `nRating = 0`.

**Critical to preserve:**
- The double-pass averaging is a deliberate dampening strategy for new players; do not remove.
- `nRating < 1` is clamped to 1 (VB6 line 1613).

**Adjustable knobs:**
- `K-factor` (default 20) — configurable via Settings dialog (admin only); stored in `ladder_settings` localStorage as `kFactor`, clamped to 1–100. The rating engine in `shared/utils/hashUtils.ts:1156` reads it from `ladder_settings` localStorage. Mini-games override to 20 via `kFactorOverride` option.
- `blendingFactor` (default 0.99) — NOT exposed in the UI; hardcoded default in `shared/utils/hashUtils.ts:1152`. Can be overridden programmatically via `blendingFactorOverride` option (used by mini-games). The engine also checks `ladder_settings.performanceBlendingFactor` in localStorage but the Settings dialog never writes this field.
- `perfMultiplierScale` (default 0.5) — NOT exposed in the UI; hardcoded default in `shared/utils/hashUtils.ts:1178`. Can be overridden programmatically via `perfMultiplierScaleOverride` option.

---

### 2.4 Mini-Game / Tournament Management

**Purpose:** Support separate "mini-game" ladder files (e.g. Queen_Game, Pawn_Game, Kings_Cross) that share player identity with the main club ladder but maintain independent game results. Admins can copy players into a new mini-game, save a mini-game from the club ladder, import mini-game files, and remove players from all mini-games.

**Inputs:**
- File name (one of the 7 allowed mini-game names).
- Player list or import content (concatenated sections of the form `=== fileName ===\n...`).

**Outputs:**
- Mini-game file written to disk alongside `ladder.tab`.
- Identity merge: when a mini-game is written, identity fields (name, group, phone, school, room, info) are reconciled with the club ladder; nRating and gameResults stay in the mini-game.
- Trophy report generated from all players across all mini-games.
- Activity report generated from all players across all mini-games.

**Success criteria:**
- Copying players from club ladder into a new mini-game produces a file with all players but empty gameResults and num_games=0.
- Saving a mini-game from the club ladder merges game results that share the same player (by case-insensitive name).
- Importing a mini-game file deduplicates players and reconciles identity with the club ladder.
- Removing a player removes them from `ladder.tab` and all existing mini-game files; game results referencing their rank are cleared.

**Critical to preserve:**
- Identity merge is the correct behavior: a mini-game file should not have divergent player names from the club ladder.

**Adjustable:**
- Mini-game file names are hardcoded to 7 specific names; adding/removing is an admin action.

---

### 2.5 Multi-Client Synchronization

**Purpose:** Allow multiple browsers to edit the ladder simultaneously, with changes visible to all clients within milliseconds and no data loss when server is unavailable.

**Inputs:**
- SSE connection (`/api/ladder/events`) — primary channel.
- Polling (`GET /api/ladder`) — fallback, every 5.5s with overlap guard.
- Hash-based change detection on each poll.

**Outputs:**
- All connected clients receive SSE events for each write. The writer's own event is filtered out (they already have their data).
- Polling detects changes via hash comparison; if hash differs, subscribers are notified.

**Success criteria:**
- Client A enters a game; Client B sees it within 100ms via SSE.
- If SSE drops, Client B still sees changes within 5.5s via polling.
- "Fetch-before-save" pattern: before saving, fetch server state, merge with local, save merged data — so Client B's unsaved entry is not clobbered by Client A's save.

**Critical to preserve:**
- Merge priority order: local unconfirmed entries > pending deletes > server confirmed entries > server default.

**Known limitation:**
- "Push to Server" on reconnect does NOT fetch-merge-first — it directly pushes local data. Risk of overwriting another client's unsaved work. Workaround: always "Pull from Server" first.

---

### 2.6 Admin Lock

**Purpose:** One admin client holds exclusive edit rights; other clients can be blocked from writing until the lock is released.

**Endpoints:**
- `POST /api/admin-lock/acquire` — normal acquire.
- `POST /api/admin-lock/force` — force-acquire (overrides existing lock).
- `POST /api/admin-lock/release` — voluntary release.
- `POST /api/admin-lock/refresh` — refresh (extend) the lock.
- `GET /api/admin-lock/status` — check current lock status.

**Success criteria:**
- Acquire succeeds when no lock is held.
- Force-acquire overrides existing lock.
- Release removes the lock.

**Technical debt / accidental:**
- Locks have a 60-second automatic timeout (`ADMIN_LOCK_TIMEOUT = 60000` in `server/src/services/adminLock.service.ts:8`). If a client disconnects without releasing, the lock expires after 60s. The `refresh` endpoint extends the timeout by resetting `acquiredAt`.

---

### 2.7 Configuration & Setup

**Purpose:** Support multiple deployment modes via URL params, auto-detection, and manual settings.

**Inputs:**
- URL params: `?config=1&server=...&key=...` (server connect), `?config=2` (local reset), `?config=3&file=...` (remote file load), `?config=4` (clear all game results, keep player data).
- Auto-detection: GET `/health` with 3s timeout on `window.location.origin`, then GET `/api/ladder` — if both respond (or 404/401/403), the origin is treated as the server.
- Drag-and-drop: `.tab`, `.xls`, or `.txt` files dropped on splash screen.

**Outputs:**
- localStorage entries for server URL, API key, project name, user settings.

**Success criteria:**
- `?config=1` connects to a remote server.
- `?config=2` clears all server settings, app runs in local mode.
- `?config=3` loads a remote file.
- `?config=4` clears all game results with confirmation dialog.

**Critical to preserve:**
- URL params are cleared via `history.replaceState` after applying, so reloads don't re-apply.

---

### 2.8 Print Labels

**Purpose:** Generate printable player labels with customizable field layouts (name, rank, rating, etc.) positioned as percentage offsets on a page of 20 or 30 labels.

**Inputs:**
- Label layout definition (each field's x%, y%, fontSize).

**Outputs:**
- Print view rendered in browser.
- Layouts optionally stored on the server.

---

### 2.9 File Import/Export

**Purpose:** Import ladder data from `.tab`/`.xls` files (both are tab-separated) and export all data as a `.zip` bundle (ladder.tab + mini-game files + trophy report).

**Inputs:**
- File upload (client-side) or URL (remote).
- Import content string (concatenated sections).

**Outputs:**
- Players written to disk; identity reconciliation performed.
- ZIP file downloaded by the browser.

**Success criteria:**
- Import preserves all players; duplicates are deduplicated.
- Export produces a valid ZIP containing all ladder and mini-game files.

---

## 3. Non-Functional Requirements

### 3.1 Performance
- **Latency:** SSE push < 100ms; polling fallback < 5.5s.
- **Throughput:** Designed for ~100 concurrent clients; rate limiter allows ~167 req/min.
- **Scale:** Supports up to 200 players (GROWS_MAX), 44 columns in tab format.
- **Hash computation:** < 1ms for 200 players × 31 rounds.

### 3.2 Security
- **Auth model:** Two-tier API keys.
  - `ADMIN_API_KEY` — protects `/api/admin/*` routes (tournament, admin lock, print layouts).
  - `USER_API_KEY` — protects write operations on ladder/games (PUT/DELETE/POST). Read operations are public.
- **CORS:** Configurable via `CORS_ORIGINS` env var (comma-separated); defaults to `*` (wildcard) when not set. The `.env.example` file sets `http://localhost:5173` for local development.
- **Rate limiting:** Three tiers:
  - `apiLimiter`: 5000 requests per 15 minutes for general API.
  - `adminLockLimiter`: 1200 requests per 60 seconds for admin lock (lenient, since clients poll every 10s).
  - `writeLimiter`: 500 requests per 15 minutes for write-heavy endpoints (game submission, batch submit).
- **Helmet:** CSP, no object/media/frame sources, formAction locked to self.
- **Request size limit:** 1 MB (configurable).

### 3.3 Reliability / Availability
- **Offline resilience:** localStorage-only mode persists all data on the client; data is lost only if the user clears browser data.
- **Reconnect:** Reconnect dialog offers "Pull from Server" (fetch-merge-save) and "Push to Server" (save directly).
- **Pending deletes queue:** Deletes are queued in localStorage and replayed on reconnect.
- **Idempotency:** Polling has an overlap guard; SSE has deduplication (writer event filtered).
- **Consistency:** Identity fields are reconciled across mini-game files; game results are deduplicated per match.

### 3.4 Observability
- **Request logging:** Every API request logged in one line: IP, method, path, query string, status, duration.
- **Debug level header:** `X-Debug-Level` header per request; client debug levels logged on change.
- **SSE heartbeat:** 30s heartbeat comments to keep connections alive.
- **Console.debug:** Extensive instrumentation throughout (debug levels 0–5).

### 3.5 Compliance
- No PII beyond chess club contact info (phone, school, room). No auth tokens, no passwords. No payment data. No GDPR-impacting logic inferred.

---

## 4. Data Model

### 4.1 Logical Entities

**Player**
- `rank` (number, unique, 1–200) — primary key.
- `group` (string) — team/group classification.
- `lastName`, `firstName` (string) — identity fields.
- `rating` (number) — historical rating (not recalculated, only used as init for num_games=0 players capped at 1800).
- `nRating` (number) — calculated rating (updated on recalculate).
- `trophyEligible` (boolean) — trophy qualification flag.
- `grade` (string) — performance grade.
- `num_games` (number) — career game count.
- `attendance` (number) — attendance count.
- `info`, `phone`, `school`, `room` (string) — identity/contact fields.
- `gameResults` ((string | null)[], length 31) — array of game result strings per round.

**PlayerData** is the single composite type; all fields are on one object.

**Match**
- `player1, player2, player3, player4` (numbers) — ranks of all four participants.
- `score1, score2` (numbers, 0–3) — scores as codes (O=0, L=1, D=2, W=3).
- `side0Won` (boolean) — whether side 0 won.

**LadderData**
- `header` (string[]) — tab file header row.
- `players` (PlayerData[]) — player records.
- `rawLines` (string[]) — raw tab lines.

### 4.2 Relationships
- One ladder contains many players.
- Each player has 0–31 game results.
- Each game result references 2 or 4 players.
- Each mini-game file has a subset of players (same identity, different game results).
- Identity fields are shared across club ladder and all mini-game files; game results and nRating are per-file.

### 4.3 Indexes & Constraints
- `rank` is unique within a ladder (dedup enforced on import).
- Ranks must be 1–200 (validation error code 9 for > 200).
- No two players in the same game may share a rank (error code 6).
- 4-player games require all 4 players to exist (error code 3 for incomplete).
- 2-player games require both players to exist (error code 2 for incomplete).

### 4.4 Data Lifecycle
- **Creation:** Players are added via admin import, manual entry, or copy from club ladder to mini-game.
- **Updates:** Ratings updated on recalculate; identity fields reconciled on mini-game write; game results entered via cell edit or batch submit.
- **Retention:** All data persisted in `ladder.tab` (server) or localStorage (client).
- **Deletion:** Players can be removed from all ladders (identity + game results cleared). Cells can be cleared individually.

---

## 5. External Integrations

### 5.1 Server (Express)
- **Purpose:** Central data store and real-time push.
- **Typical payloads:** JSON player lists, game result strings, admin lock status.
- **Error modes:** 401/403 for bad API key; 500 for file I/O failure; SSE disconnect triggers polling fallback.
- **SLA:** None formalized; designed for < 100ms SSE push.

### 5.2 Browser (React SPA)
- **Purpose:** User interface, local state, SSE client.
- **Typical payloads:** User edits, game entries, trophy/activity reports, print labels.
- **Error modes:** Browser cache corruption, localStorage quota exhaustion, SSE disconnect.
- **SLA:** None formalized.

### 5.3 File Format (.tab / .xls)
- **Purpose:** Portable data exchange. Both formats are tab-separated values.
- **Typical payloads:** Tab-separated rows with player data and 31 game result columns.
- **Error modes:** Corrupted files, mismatched header rows, duplicate ranks.
- **SLA:** None formalized.

### 5.4 Reverse Proxy (nginx)
- **Purpose:** Subdomain-based routing. Frontend and backend share the same origin per subdomain.
- **Typical payloads:** HTTP requests routed to correct backend.
- **Error modes:** Misconfigured subdomain routing.
- **SLA:** Implicit; auto-detection validates connectivity.

---

## 6. Key Workflows

### 6.1 Enter a Game Result

**Trigger:** User clicks a cell in Enter Games mode.

**Validation:**
1. User types a result string (e.g. "4W5").
2. System parses it via `parseEntry` / `string2long`.
3. If invalid, an error dialog shows with the error code and the corrected string.
4. If valid, the result is stored in the cell.

**Core logic:**
1. Result string parsed to extract player ranks and scores.
2. Result string written to the cell's `gameResults[round]`.
3. Opponent's cell is auto-filled with the reciprocal result (e.g. "4L5").

**Side effects:**
- Cell marked as unsaved (no `_` suffix) until confirmed.
- Delta queued for server sync (if in server mode).

**Error handling:**
- Invalid format shows error code and corrected string.
- User can clear the cell and advance to next error.

---

### 6.2 Save (Recalculate and Save)

**Trigger:** User clicks Save button.

**Validation:**
1. All cells are validated.
2. Errors are collected; if any exist, an error dialog shows.
3. User can clear errors before proceeding.

**Core logic:**
1. Fetch server state (fetch-before-save pattern).
2. Merge server state with local state (preserve local unconfirmed entries).
3. Process all game results: parse each, build matches, check for conflicts.
4. Calculate ratings (double-pass averaging).
5. Repopulate game results from validated matches.
6. Save merged data to server via PUT `/api/ladder`.

**Side effects:**
- All players' ratings updated.
- All game results repopulated from validated matches.
- Server state updated.
- SSE event broadcast to all clients.

**Error handling:**
- Conflicting results produce error code 10.
- Missing players produce error code 11.
- Duplicate ranks produce error code 6.

---

### 6.3 Multi-Client Sync

**Trigger:** One client saves; all connected clients receive the change.

**Core logic:**
1. Client A saves → server writes → SSE event broadcast.
2. Client B receives SSE event → dataService notifies subscribers.
3. Client B's UI refreshes with new data.

**Fallback:**
1. SSE disconnects.
2. Polling runs every 5.5s.
3. Poll fetches server state, computes hash, compares with last hash.
4. If hash differs → notify subscribers.

**Error handling:**
- SSE reconnects after 1s (exponential backoff up to 60s).
- Poll has overlap guard (skip if previous request pending).
- Server write failures are tracked (consecutive failure count).

---

### 6.4 Reconnect (Server Down / Network Issue)

**Trigger:** Client detects server is unreachable.

**Core logic:**
1. Reconnect dialog appears.
2. User chooses "Pull from Server" (fetch-merge-save) or "Push to Server" (save directly).
3. Pending deletes are replayed.
4. Data is merged or pushed.
5. UI reloads.

**Error handling:**
- "Push to Server" does NOT fetch-merge-first — risk of overwriting another client's unsaved work.
- Workaround: always "Pull from Server" first.

---

### 6.5 New Day (Tournament Reset)

**Trigger:** User clicks "New Day" in Settings.

**Core logic:**
1. Check for errors (recalculate).
2. If errors exist, error dialog shows; New Day is deferred.
3. If no errors, process New Day transformations.
4. Save players with transformed data.
5. Set project name to next title (e.g., "Bughouse" → "Queen_Game").
6. Clear settings.
7. Reload UI.

**Side effects:**
- All ratings reset (num_games = 0).
- Project name changes to next mini-game title.
- All mini-game files are saved (if in tournament mode).

**Error handling:**
- Errors block New Day until cleared.

---

### 6.6 Import Mini-Game Files

**Trigger:** Admin uploads a `.zip` or `.txt` bundle.

**Core logic:**
1. Parse bundle (ZIP or concatenated sections).
2. For each section: parse players, deduplicate, write to mini-game file.
3. Reconcile identity with club ladder.
4. Remove stale mini-game files (those not in the import).
5. Backup existing files to `old/` directory.

**Side effects:**
- All mini-game files replaced with imported data.
- Identity fields reconciled across all files.

**Error handling:**
- Unknown file names produce errors.
- Duplicate players are deduplicated.

---

## 7. Configuration & Environment

### 7.1 Important Configuration Knobs

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (development / production) | development |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | http://localhost:5173 |
| `ADMIN_API_KEY` | Admin API key (protects /api/admin/*) | dev-admin-key-change-in-production |
| `USER_API_KEY` | User API key (protects write operations) | change-this-to-a-random-key |
| `TAB_FILE_PATH` | Path to ladder.tab | ./data/ladder.tab |
| `REQUEST_SIZE_LIMIT` | Max request body size | 1mb |

### 7.2 Client-Side Configuration

Client-side settings are stored in `localStorage` using a per-ladder prefix derived from `window.location` (e.g. `ladder_localhost_`). Three separate storage keys are used:

**`ladder_settings`** (Settings dialog, admin-only writes):

| Setting | Purpose | Default |
|---------|---------|---------|
| `showRatings` | Boolean array for rating visibility | `[true, true, true, true]` |
| `debugLevel` | Console debug verbosity (0–5) | 5 |
| `kFactor` | Elo K-factor (clamped 1–100) | 20 |

**`ladder_user_settings`** (Settings dialog, all users):

| Setting | Purpose | Default |
|---------|---------|---------|
| `server` | Server URL | empty (local mode) |
| `apiKey` | API key for server auth | empty |

**`ladder_project_name`** (set by New Day / Settings):

| Setting | Purpose | Default |
|---------|---------|---------|
| (string value) | Current tournament title | `Bughouse Chess Ladder` |

**`ladder_zoom`** (UI preference):

| Setting | Purpose | Default |
|---------|---------|---------|
| (number value) | UI zoom level | 100 |

**Note:** `blendingFactor` (0.99) and `perfMultiplierScale` (0.5) are NOT stored in client settings. They are hardcoded defaults in `shared/utils/hashUtils.ts` and can only be overridden programmatically via function options.

### 7.3 Deployment Model

- **Frontend:** React SPA built with Vite; served as static files in production, dev server on port 5173.
- **Backend:** Node/Express API on port 3000; built from TypeScript source.
- **Shared code:** TypeScript library compiled separately; consumed by both frontend and backend.
- **Data:** `ladder.tab` (tab-separated file) on the server filesystem; gitignored.
- **Build pipeline:** Frontend uses `npm run build` (tsc + vite build); backend uses 4-step pipeline (compile-shared → tsc → patch-shared-imports → flatten-server-dist).
- **Deploy:** `deploy/update.sh` script (stashes, pulls, cleans, builds, restarts).

---

## 8. Constraints & Design Decisions

### 8.1 Inferred Design Decisions

- **Single-file data format:** The system uses a single `.tab` file as the source of truth. This is a deliberate choice to avoid database complexity; the file is human-readable and diffable.
- **No database:** All data persistence is file-based (server) or localStorage-based (client). This is intentional for simplicity and portability.
- **SSE over WebSocket:** SSE is used for real-time push because it is HTTP-compatible, proxy-friendly, and simpler than WebSocket. WebSocket was considered but rejected for complexity.
- **Double-pass rating calculation:** The double-pass averaging is a deliberate dampening strategy for new players; it is not a bug.
- **Merge priority order:** Local unconfirmed entries > pending deletes > server confirmed entries > server default. This is a deliberate choice to preserve user work.
- **Admin lock:** One admin client holds exclusive edit rights; this is a deliberate choice to prevent conflicts.

### 8.2 Known Limitations

- **No real-time conflict detection:** If two clients edit the same cell simultaneously, the second client's edit overwrites the first. The "fetch-before-save" pattern mitigates this but is not foolproof.
- **LocalStorage-only mode:** All data is lost if the user clears browser data; there is no automatic backup.
- **No pagination:** The entire ladder is loaded in memory; 200 players × 31 rounds = 6200 cells.
- **No search/filter:** The ladder is a flat grid; no search by name or rank.
- **No user accounts:** Access is based on API keys, not user accounts.

### 8.3 "Weird but Intentional" Behaviors

- **Underscore suffix:** Game results with `_` suffix are "confirmed" (server-saved); without `_` are "unconfirmed" (local-only). This is a client-side convention used by the merge algorithm to distinguish local unconfirmed entries from server-confirmed entries. It is stored in the data but is not part of the parseEntry validation — `parseEntry` strips it during parsing.
- **Project name as title:** The project name is the current tournament title (e.g., "Bughouse" → "Queen_Game"). This is a deliberate choice to track tournament progression through a fixed sequence.
- **Mini-game files as chess variants:** The 7 mini-game files are named after chess variants. This is a deliberate choice to track different tournament formats.
- **Tab-separated format:** The `.tab` file format is tab-separated values. This is a deliberate choice for human readability and diffability.

### 8.4 Fragile / Complex Areas

- **Identity merge:** Reconciling player identity across mini-game files and club ladder is complex; errors can cause divergent player names.
- **Merge priority order:** The merge priority order is complex; errors can cause data loss.
- **Double-pass rating calculation:** The double-pass averaging is complex; errors can cause incorrect ratings.
- **SSE + polling fallback:** The hybrid sync strategy is complex; errors can cause missed updates.
- **Admin lock:** The admin lock is complex; errors can cause lockouts.

---

## 9. Open Questions & Ambiguities

### 9.1 Resolved (moved to 9.2)

All previously unclear behaviors have been resolved from code analysis.

### 9.2 Resolved Questions

- **Project name progression** — Fixed sequence, not configurable. `getNextTitle()` in `shared/utils/constants.ts:78` iterates through `MINI_GAMES_WITH_BUGHOUSE` in order (Ladder → BG_Game → Bishop_Game → Pillar_Game → Kings_Cross → Pawn_Game → Queen_Game → Bughouse → wrap to Ladder).
- **Mini-game file naming** — Hardcoded to 7 names in `shared/types/index.ts` (`MINI_GAME_FILES`) and `shared/utils/constants.ts` (`MINI_GAMES_WITH_BUGHOUSE`). Adding/removing is an admin action only.
- **Grade calculation** — Stored as a string (e.g., "1st", "2nd", "3rd") in the tab file header column 7. Not computed by the rating engine; it is a label that the scorekeeper enters or that is carried forward from the previous ladder. The `normalizeGrades()` function in `shared/utils/dedupUtils.ts:115` converts "N/A" to " " (space) — indicating grade is a freeform label, not a computed value.
- **Trophy eligibility** — `false` means the player's rating is negated (displayed as `-1200` in exports) and excluded from trophy awards. The flag is set per-player (user-selectable in the Add Player dialog). The `compareByPseudoRating()` function in `shared/utils/constants.ts:127` uses `trophyEligible` to invert the sort order of ineligible players (negative pseudo-rating), giving them lower ranks.
- **Underscore suffix** — Not inconsistent: it is a deliberate convention used by the merge algorithm to distinguish local unconfirmed entries from server-confirmed entries. `parseEntry` strips it during parsing, so it is never stored in the hash.
- **K-factor** — Default is 20 (line 1151 in `shared/utils/hashUtils.ts`). Can be overridden per-call via `kFactorOverride` option (used in `recalculateMiniGameRatings` with value 20). The `EloKfactor` from server settings is used if no override is provided (line 1162).
- **Blending factor** — Default is 0.99 (line 1152 in `shared/utils/hashUtils.ts`). Can be overridden per-call via `blendingFactorOverride` option (used in `recalculateMiniGameRatings` with value 0.99). The `performanceBlendingFactor` from server settings is used if no override is provided (line 1164).
- **Admin lock duration** — Fixed at 60 seconds (`ADMIN_LOCK_TIMEOUT = 60000` in `server/src/services/adminLock.service.ts:8`). Not configurable; can be extended by calling the `refresh` endpoint which resets `acquiredAt`.

### 9.3 Inconsistent Behaviors

- **Push to Server:** "Push to Server" on reconnect does NOT fetch-merge-first; it directly pushes local data. This is inconsistent with the "fetch-before-save" pattern. The documentation acknowledges this but does not explain why.
- **Admin lock expiration:** Admin locks auto-expire after 60 seconds. A client can extend via the `refresh` endpoint. Orphaned locks (client disconnected without releasing) expire naturally.

### 9.4 Configured Values (from code)

| Parameter | Value | File | Notes |
|---|---|---|---|
| `kFactor` default | 20 | `shared/utils/hashUtils.ts:1151` | Client-side rating engine default |
| `blendingFactor` default | 0.99 | `shared/utils/hashUtils.ts:1152` | Client-side rating engine default |
| `perfMultiplierScale` default | 0.5 | `shared/utils/hashUtils.ts:1178` | Client-side rating engine default |
| `ADMIN_LOCK_TIMEOUT` | 60000ms (60s) | `server/src/services/adminLock.service.ts:8` | Server-side admin lock timeout |
| `nRating` default | 1 | `src/components/LadderForm.tsx` | New player default nRating via `Math.abs(rating \|\| 1)` |

---

## Appendix: API Endpoint Reference

### Ladder Routes
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/ladder` | None | Fetch all players |
| GET | `/api/ladder/:rank` | None | Fetch single player |
| PUT | `/api/ladder` | User/Admin key | Bulk update players |
| PUT | `/api/ladder/:rank` | User/Admin key | Update single player |
| DELETE | `/api/ladder/:rank/round/:roundIndex` | User/Admin key | Clear cell |
| POST | `/api/ladder/batch` | User/Admin key | Batch submit game results |
| POST | `/api/ladder/mini-games/write` | User/Admin key | Write mini-game file |
| GET | `/api/ladder/mini-games/read` | None | Read mini-game file |
| GET | `/api/ladder/mini-games/check` | None | Check mini-game files |

### Games Routes
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/games/` | User/Admin key | Submit single game result |
| POST | `/api/games/batch` | User/Admin key | Batch submit game results |

### Admin Routes
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/admin-lock/acquire` | Admin key | Acquire admin lock |
| POST | `/api/admin-lock/force` | Admin key | Force-acquire admin lock |
| POST | `/api/admin-lock/release` | Admin key | Release admin lock |
| POST | `/api/admin-lock/refresh` | Admin key | Refresh admin lock |
| GET | `/api/admin-lock/status` | Admin key | Check admin lock status |
| POST | `/api/admin/upload` | Admin key | Upload .tab/.xls file |
| GET | `/api/admin/export` | Admin key | Export ladder as .tab |
| GET | `/api/admin/backups` | Admin key | List backups |
| POST | `/api/admin/backups/restore/:filename` | Admin key | Restore backup |
| GET | `/api/admin/backups/preview/:filename` | Admin key | Preview backup |
| DELETE | `/api/admin/backups/:filename` | Admin key | Delete backup |
| POST | `/api/admin/tournament/import` | Admin key | Import mini-game files |
| POST | `/api/admin/tournament/import-single` | Admin key | Import single mini-game file |
| POST | `/api/admin/tournament/copy-players` | Admin key | Copy players to mini-game |
| POST | `/api/admin/tournament/save-mini-game` | Admin key | Save mini-game from club ladder |
| POST | `/api/admin/tournament/write-mini-game` | Admin key | Write mini-game file |
| POST | `/api/admin/tournament/clear-mini-games` | Admin key | Clear all mini-game files |
| POST | `/api/admin/tournament/clear-empty-mini-games` | Admin key | Clear empty mini-game files |
| POST | `/api/admin/tournament/add-player-to-mini-games` | Admin key | Add player to all mini-games |
| POST | `/api/admin/tournament/remove-player-from-all` | Admin key | Remove player from all |
| PUT | `/api/admin/tournament/update-player-in-all` | Admin key | Update player in all |
| GET | `/api/admin/tournament/read-mini-game` | User/Admin key | Read mini-game file |
| GET | `/api/admin/tournament/check-mini-games` | User/Admin key | Check mini-game files |
| GET | `/api/admin/tournament/export` | Admin key | Export tournament files as ZIP |
| GET | `/api/admin/tournament/trophies` | User/Admin key | Generate trophy report |
| GET | `/api/admin/activity-report` | Admin key | Generate activity report |
| POST | `/api/admin/clear-results` | Admin key | Clear all game results |
| GET | `/api/admin/export-mini-data` | Admin key | Export all data as ZIP |

**Auth note:** `requireAdminKey` middleware allows user key for `GET /tournament/*` routes (read-only mini-game endpoints). All other admin routes require admin key.

### Print Layouts Routes
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/print-layouts` | None | Fetch all print layouts |
| POST | `/api/print-layouts` | User/Admin key | Create or update print layout |
| DELETE | `/api/print-layouts/:name` | User/Admin key | Delete print layout |

### Health Endpoint
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Health check (returns version, write health) |

### SSE Endpoint
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/ladder/events` | None | Server-Sent Events (real-time push) |
