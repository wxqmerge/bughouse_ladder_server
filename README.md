# Bughouse Chess Ladder Server

**Version: 1.2.0**

A modern client-server implementation of the VB6 Bughouse Chess Ladder application.

**Communication:** TCP/HTTP (NOT UDP). Default port is 3000.

## Quick Start

```bash
# Install dependencies
npm install
cd server && npm install && cd ..

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your settings

# Start backend (Terminal 1)
cd server && npm run dev

# Start frontend (Terminal 2)
npm run dev
```

**Access:** http://localhost:5173

---

## Architecture

### Directory Structure

```
bughouse_ladder_server/
├── shared/                    # Shared code between client and server
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   └── utils/
│       ├── hashUtils.ts      # Core game processing logic
│       └── constants.ts      # Shared constants
├── server/                    # Node.js/Express backend
│   ├── src/
│   │   ├── index.ts         # Server entry point
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API route handlers
│   │   └── services/        # Business logic services
│   ├── data/
│   │   └── ladder.tab       # Active ladder data (source of truth)
│   ├── package.json
│   └── tsconfig.json
├── src/                       # React frontend
│   ├── components/
│   ├── contexts/
│   ├── services/
│   └── utils/
└── package.json
```

### Data Flow

```
  FRONTEND (React) — Port: 5173
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Settings  │  │DataService│  │ LadderForm│
  │Context   │  │ (Data)    │  │ (UI)     │
  └──────────┘  └──────────┘  └──────────┘
                       │ HTTP/REST
                       ▼
  BACKEND (Express) — Port: 3000
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Auth     │  │Ladder    │  │ Games    │
  │ Routes   │  │Routes    │  │Routes    │
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │             │              │
       └─────────────┼──────────────┘
                     ▼
              ┌─────────────┐
              │DataService  │
              │ (File I/O)  │
              └──────┬──────┘
                     ▼
             data/ladder.tab
```

---

## Configuration Methods

### Auto-Detect Server URL (Default)

When no manual config exists, the app auto-detects the server from `window.location.origin`:
1. Tries `GET /health` with 3s timeout
2. If server responds → enters SERVER mode
3. If failed → falls back to LOCAL mode

Works because frontend and backend share the same origin per subdomain (nginx proxy).

### URL-Based Setup (One-Click)

| Config | URL Format | Purpose |
|--------|------------|---------|
| Server + key | `?config=1&server=http://host:port&key=yourkey` | Connect to server (overrides auto-detect) |
| Local mode | `?config=2` | Reset to local mode |
| Remote file | `?config=3&file=http://host/file.tab` | Fetch and load .tab/.xls |

### Drag & Drop (Local Files)

Drag a `.tab`, `.xls`, or `.txt` file onto the splash screen to load it directly. No server needed.

---

## Features

- Elo rating calculation for chess games
- Player management (add, edit, delete, rank)
- Game result submission (single and batch)
- Title progression system
- File import/export (.tab format)
- Multi-client synchronization (see [ARCHITECTURE.md](./ARCHITECTURE.md))

---

## API Endpoints

### Ladder Data
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/ladder` | None | Get all ladder data |
| `GET` | `/api/ladder/:rank` | None | Get single player |
| `PUT` | `/api/ladder/:rank` | User/Admin key | Update player |
| `PUT` | `/api/ladder` | User/Admin key | Bulk update players |
| `DELETE` | `/api/ladder/:rank/round/:roundIndex` | User/Admin key | Remove game result |
| `POST` | `/api/ladder/batch` | User/Admin key | Batch submit game results |

### Games
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/games/submit` | User/Admin key | Submit game result |
| `POST` | `/api/games/batch` | User/Admin key | Batch submit games |
| `GET` | `/api/games/player/:rank` | None | Get player's game results |

---

## Documentation
| File | Purpose |
|------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, multi-client sync design |
| [README_INSTALL.md](./README_INSTALL.md) | Production deployment guide |
| [USER_MANUAL.md](./USER_MANUAL.md) | End-user guide for entering games |
| [ADMIN_MANUAL.md](./ADMIN_MANUAL.md) | Administrator operations reference |
| [SECURITY.md](./SECURITY.md) | Security configuration and hardening |
| [TESTS.md](./TESTS.md) | Unit test suite documentation |

---

## License

MIT
