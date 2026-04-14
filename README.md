# Bughouse Chess Ladder Server

A modern client-server implementation of the VB6 Bughouse Chess Ladder application.

## Quick Start

### Development Setup

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
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                        │
│                  Port: 5173                                 │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  SettingsContext │  │    DataService   │                │
│  │  (Mode Config)   │  │  (Data Access)   │                │
│  └────────┬─────────┘  └─────────┬────────┘                │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      ▼                                     │
│              ┌───────────────┐                            │
│              │  LadderForm   │                            │
│              │   (UI)        │                            │
│              └───────────────┘                            │
└────────────────────┬──────────────────────────────────────┘
                     │ HTTP/REST
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Express)                        │
│                   Port: 3000                                │
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
│                   data/ladder.tab                          │
└────────────────────────────────────────────────────────────┘
```

---

## Features

### Multi-Mode Data Access

| Mode | Description | Use Case |
|------|-------------|----------|
| **LOCAL** | Browser localStorage only | Quick testing, offline development |
| **DEVELOPMENT** | Client-server (localhost) | Full-stack debugging |
| **SERVER** | Client-server (production) | Production deployment |

### Security Features

- Admin API key protection for admin endpoints (optional)
- Rate limiting (100 API requests per 15 min)
- CORS configuration with production warnings
- Helmet.js security headers
- Content Security Policy (production only)
- Timing-safe API key comparison

### Core Functionality

- Elo rating calculation for chess games
- Player management (add, edit, delete, rank)
- Game result submission (single and batch)
- Title progression system
- Automatic new day processing
- File import/export (.tab format)
- Multi-client synchronization (5-second polling with change detection)

---

## Multi-Client Synchronization

### Overview

The application supports multiple users editing the ladder simultaneously from different browsers. Changes are automatically synchronized across all connected clients.

### How It Works

**1. Fetch-Before-Save (Prevents Overwrites)**
```
Browser A saves:
  1. Fetch latest data from server
  2. Merge with local unconfirmed entries
  3. Process and save merged result to server
  
Result: Browser B's changes are preserved, not overwritten
```

**2. Polling with Change Detection (5-second interval)**
```
Every 5 seconds:
  1. Fetch from server (cache only, no sync)
  2. Compute hash of game results
  3. If hash changed → notify subscribers
  4. Subscribers refresh UI with fresh data
  
Result: Browser B sees Browser A's changes within 5 seconds
```

**3. Smart Merge Strategy**
```
Local unconfirmed entries > Server confirmed > Server unconfirmed

- Local unconfirmed: User entered but hasn't saved yet → PRESERVED
- Server confirmed: Saved by another client → KEPT
- Pending deletes: Queued for retry on reconnect → REPLAYED
```

**4. Offline Resilience**
```
If server is down:
  - Game entries saved to localStorage
  - Deletes queued in localStorage
  - On reconnect: automatic merge + replay pending operations
```

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      BROWSER A (Client)                          │
│                                                                  │
│  User enters "4w5" → Local state updated                        │
│                    ↓                                             │
│  Click Save → Fetch from server (GET /api/ladder)              │
│                    ↓                                             │
│  Merge: Server data + Local unconfirmed entries                │
│                    ↓                                             │
│  Recalculate ratings                                            │
│                    ↓                                             │
│  Save to server (PUT /api/ladder) → ladder.tab updated         │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             │ Server saves to data/ladder.tab
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      BROWSER B (Client)                          │
│                                                                  │
│  Polling interval (5s):                                         │
│    GET /api/ladder → hash compare                               │
│                    ↓                                             │
│  Hash changed? YES → notify subscribers                         │
│                    ↓                                             │
│  Refresh UI: Fetch fresh data, update React state              │
│                    ↓                                             │
│  User sees "4w5" without page refresh                          │
└──────────────────────────────────────────────────────────────────┘
```

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Polling interval | 5000ms (5 seconds) | How often to check for changes |
| Change detection | Hash comparison | Only refreshes when data actually changed |
| Merge strategy | Local-first | Preserves local unconfirmed entries |

### Limitations

- **Latency**: Up to 5 seconds before changes visible on other clients
- **No real-time push**: Uses polling (not WebSockets) for simplicity and reconnect resilience
- **Conflict resolution**: Local unconfirmed entries always win over server data

---

## API Endpoints

### Ladder Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ladder` | Get all ladder data (public) |
| `GET` | `/api/ladder/:rank` | Get single player |
| `PUT` | `/api/ladder/:rank` | Update player (authenticated) |
| `PUT` | `/api/ladder` | Bulk update (admin only) |
| `DELETE` | `/api/ladder/:rank/round/:roundIndex` | Remove game result |

### Games
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/games/submit` | Submit game result (authenticated) |
| `POST` | `/api/games/batch` | Batch submit games (authenticated) |
| `GET` | `/api/games/player/:rank` | Get player's game results |

### Admin Endpoints *(requires API key)*
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/upload` | Upload .tab file |
| `GET` | `/api/admin/export` | Export as .tab file |
| `POST` | `/api/admin/process` | Process game results |
| `POST` | `/api/admin/regenerate` | Regenerate ratings |
| `GET` | `/api/admin/stats` | Server statistics |
| `GET` | `/api/admin/performance` | Performance metrics |
| `POST` | `/api/admin/performance/clear` | Clear performance data |

### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health status |

---

## Environment Variables

### Server (`.env` in `server/`)

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# CORS Origin - Your production domain (required for security)
CORS_ORIGIN=https://your-domain.com

# Admin API Key - OPTIONAL: Protects admin endpoints (/api/admin/*)
# Requests must include header: X-API-Key: <this-value>
# Leave empty for local/development use
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_API_KEY=

# Data
TAB_FILE_PATH=./data/ladder.tab
```

### Frontend (`.env` in root)

```env
# API URL - Leave empty or use /api for same-origin requests (recommended)
VITE_API_URL=/api
```

The frontend uses relative API paths by default, so no configuration is needed for most deployments.

---

## Documentation

| File | Purpose |
|------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and multi-client sync design |
| [README_INSTALL.md](./README_INSTALL.md) | Production deployment guide |
| [USER_MANUAL.md](./USER_MANUAL.md) | End-user guide for entering games |
| [ADMIN_MANUAL.md](./ADMIN_MANUAL.md) | Administrator operations reference |
| [SECURITY.md](./SECURITY.md) | Security configuration and hardening |
| [TESTS.md](./TESTS.md) | Unit test suite documentation |

---

## License

MIT
