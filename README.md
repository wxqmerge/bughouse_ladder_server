# Bughouse Chess Ladder Server

A modern client-server implementation of the VB6 Bughouse Chess Ladder application.

## Architecture

```
bughouse_ladder_server/
├── shared/                    # Shared code between client and server
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces and types
│   └── utils/
│       ├── index.ts          # Re-exports for easy importing
│       ├── hashUtils.ts      # Core game processing logic
│       └── constants.ts      # Shared constants
├── server/                    # Node.js/Express backend
│   ├── src/
│   │   ├── index.ts         # Server entry point
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API route handlers
│   │   └── services/        # Business logic services
│   ├── package.json
│   └── tsconfig.json
├── src/                       # React frontend
│   ├── components/
│   ├── contexts/
│   ├── services/
│   └── utils/
└── data/
    └── ladder.tab            # Ladder data file
```

## Features

- **Multi-Mode Support**:
  - `LOCAL`: Legacy localStorage behavior
  - `DEVELOPMENT`: Client-server flow targeting localhost
  - `SERVER`: Client-server flow targeting production server

- **Role-Based Access Control (RBAC)**:
  - `User`: Submit games only
  - `Admin`: Full access to all features

- **Concurrency**: File locking on the backend ensures atomic writes to the `.tab` file

- **Data Sync**: ~15-second polling interval for data synchronization

## Getting Started

### Server Setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

### Frontend Setup

```bash
npm install
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token

### Ladder
- `GET /api/ladder` - Get all ladder data (public)
- `GET /api/ladder/:rank` - Get single player
- `PUT /api/ladder/:rank` - Update player (authenticated)
- `PUT /api/ladder` - Bulk update (admin only)

### Games
- `POST /api/games/submit` - Submit game result (authenticated)
- `POST /api/games/batch` - Batch submit games (authenticated)
- `GET /api/games/player/:rank` - Get player's game results

### Admin
- `POST /api/admin/upload` - Upload .tab file
- `GET /api/admin/export` - Export as .tab file
- `POST /api/admin/process` - Process game results
- `GET /api/admin/stats` - Server statistics

## Environment Variables

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5173
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
TAB_FILE_PATH=./data/ladder.tab
```

## License

MIT
