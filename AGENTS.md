# Agent Instructions: Bughouse Chess Ladder

## Project Structure
- **Frontend (Root):** React/Vite application (Port 5173).
- **Backend (`server/`):** Node.js/Express API (Port 3000).
- **Shared (`shared/`):** Common TypeScript types and utilities used by both client and server.

## Developer Commands

### Frontend (Root Directory)
- `npm run dev`: Start Vite development server.
- `npm run build`: Build production assets (`tsc && vite build`).
- `npm run typecheck`: Run TypeScript type checking (`tsc --noEmit`).
- `npm run test`: Run Vitest unit tests.

### Backend (`server/` Directory)
- `npm run dev`: Start development server with `tsx watch`.
- `npm run build`: **CRITICAL** - Performs complex build involving shared code compilation and patching. Do NOT run `tsc` alone.
- `npm run start`: Run the production build.
- `npm run typecheck`: Run TypeScript type checking.
- `npm run test`: Run Vitest unit tests.

## Core Architecture & Synchronization

### Hybrid Sync Strategy
To support multi-client synchronization and offline resilience, the system uses a hybrid approach:
1. **Primary (SSE):** Server-Sent Events provide instant updates (<100ms) on any write operation.
2. **Fallback (Polling):** A 5.5s polling loop catches any missed SSE events.
   - **Overlap Guard:** Polling skips a cycle if the previous request is still pending to prevent request stacking.

### Merge & Conflict Resolution
The system uses a "Fetch-Before-Save" pattern to prevent data loss during concurrent edits.
**Merge Priority (Highest to Lowest):**
1. **Local unconfirmed entries:** Cells without a `_` suffix.
2. **Pending deletes:** Queued deletions in `localStorage`.
3. **Server confirmed entries:** Cells with a `_` suffix.
4. **Server default:** Fallback to current server state.

### Change Detection
The client uses a hash-based change detection algorithm. It computes a hash of game results from the server response and compares it to the `lastDataHash` to decide whether to notify subscribers.

## Configuration

### Environment
- **Backend:** Requires `.env` in `server/` directory. Copy from `server/.env.example`.
- **Frontend:** Supports URL-based configuration for quick setup:
  - `?config=1&server=URL&key=KEY`: Connect to a specific server with an API key.
  - `?config=2`: Reset to `LOCAL` mode (localStorage).
  - `?config=3&file=URL`: Load a remote `.tab` or `.xls` file.

## Testing & Verification
- **Framework:** Vitest is used for both frontend and backend.
- **Client Tests:** Located in `src/test/unit/`.
- **Server Tests:** Located in `server/test/`.
- **Verification:** Always run `npm run typecheck` and relevant tests after making changes.
