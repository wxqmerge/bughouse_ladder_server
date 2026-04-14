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
- Real-time data synchronization (~15s polling)

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
| [README_INSTALL.md](./README_INSTALL.md) | Production deployment guide |
| [SECURITY.md](./SECURITY.md) | Security configuration and hardening |
| [TESTS.md](./TESTS.md) | Unit test suite documentation |

---

## License

MIT
