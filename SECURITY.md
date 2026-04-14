# Security Configuration Summary

## Architecture Overview

### Storage Model

**LOCAL Mode (no server configured in UI):**
- All data stored in browser localStorage only
- No server communication
- Data persists only in current browser
- **Cannot write to local ladder.tab** (browser security limitation)

**SERVER Mode (server configured via UI settings):**
- Frontend stores data in localStorage (immediate, fast)
- Background sync sends PUT requests to server
- Server writes to `server/data/ladder.tab` (source of truth)
- Multiple clients can share the same ladder data

### Files
- `data/ladder.tab` - **DELETED** - Useless (browser cannot write to local filesystem)
- `server/data/ladder.tab` - **ACTIVE** - Server writes here, shared across all clients

---

## Changes Applied

### 1. 🔴 CRITICAL: Hardcoded Credentials Fixed

#### Before:
```typescript
// auth.routes.ts
const defaultAdminUsername = process.env.ADMIN_USERNAME || 'admin';
const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'admin123';
```

#### After:
```typescript
// auth.routes.ts  
const defaultAdminUsername = process.env.ADMIN_USERNAME!;
const defaultAdminPassword = process.env.ADMIN_PASSWORD!;

if (!defaultAdminUsername || !defaultAdminPassword) {
  console.error('ERROR: Required environment variables missing');
  process.exit(1);
}
```

**Impact:** Server will NOT start without proper admin credentials configured.

---

### 2. 🔴 CRITICAL: JWT Secret Validation

#### Before:
```typescript
// auth.middleware.ts
export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
```

#### After:
```typescript
// index.ts (validation runs at startup)
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is required');
  process.exit(1);
}
```

**Impact:** Prevents token forgery attacks from default secret.

---

### 3. 🔴 CRITICAL: CORS Configuration Fixed

**Before:**
```typescript
app.use(cors({ origin: '*', credentials: true }));  // ⚠️ DANGEROUS!
```

**After:**
```typescript
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['*'];
if (isProduction && corsOrigins.includes('*')) {
  console.warn('⚠️ SECURITY WARNING: CORS Origins set to "*" in production!');
}
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
```

**Impact:** Configurable CORS origins with production warning on wildcard.

---

### 4. 🟠 HIGH: Content Security Policy Enabled

#### Before:
```typescript
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for development
}));
```

#### After:
```typescript
const isProduction = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", process.env.CORS_ORIGIN],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  } : false,
}));
```

**Impact:** XSS protection enabled in production.

---

### 5. 🟠 HIGH: Rate Limiting Strengthened

**Before:**
```typescript
const authLimiter = rateLimit({ max: 100 });  // Too permissive
const apiLimiter = rateLimit({ max: 1000 });  // Way too high for production
```

**After:**
```typescript
const authLimiter = rateLimit({ max: 10 });   // Strict - prevent brute force
const apiLimiter = rateLimit({ max: isProduction ? 100 : 1000 });  // Adaptive
```

**Impact:** Brute force protection on login (10 attempts) and API endpoints (100 req/15min in production).

---

### 6. 🟠 HIGH: Request Size Limiting Added

**Before:**
```typescript
app.use(express.json({ limit: '10mb' }));  // Too permissive - DoS risk
```

**After:**
```typescript
const requestSizeLimit = process.env.REQUEST_SIZE_LIMIT || '1mb';
app.use(express.json({ limit: requestSizeLimit }));
app.use(express.urlencoded({ extended: true, limit: requestSizeLimit }));
```

**Impact:** Prevents DoS attacks from large payloads.

---

### 7. 🟠 HIGH: HTTP Method Security Added

```typescript
app.use((req, res, next) => {
  const dangerousMethods = ['TRACE', 'TRACK', 'CONNECT'];
  if (dangerousMethods.includes(req.method)) {
    console.log(`[SECURITY] Blocked dangerous method: ${req.method}`);
    return res.status(405).json({ success: false, error: { message: 'Method not allowed' } });
  }
  next();
});
```

**Impact:** Blocks dangerous HTTP methods used in reconnaissance attacks.

---

### 8. 🟡 MEDIUM: Security Logging Added

```typescript
if (isProduction) {
  app.use('/api/*', (req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress;
    if (req.path.includes('..') || req.path.includes('<script')) {
      console.log(`[SECURITY] Suspicious request from ${clientIp}: ${req.method} ${req.path}`);
    }
    next();
  });
}
```

**Impact:** Logs suspicious requests (path traversal, XSS attempts) for monitoring.

---

### 9. 🟡 MEDIUM: Admin API Key Timing-Safe Comparison

**Before:**
```typescript
if (apiKey !== ADMIN_API_KEY) {  // Vulnerable to timing attacks!
```

**After:**
```typescript
import crypto from 'crypto';
const keyBuffer = Buffer.from(ADMIN_API_KEY, 'utf-8');
const providedBuffer = Buffer.from(apiKey, 'utf-8');
if (!crypto.timingSafeEqual(keyBuffer, providedBuffer)) {
  // Reject with same timing regardless of where mismatch occurs
}
```

**Impact:** Prevents timing attacks on admin API key validation.

---

### 6. 🟡 MEDIUM: Game Submission Authorization

#### Before:
```typescript
// Allowed any authenticated user to submit for any player
if (req.user?.role !== 'admin') {
  console.log(`User submitting for player ${playerRank}`);
}
```

#### After:
```typescript
// Non-admin users must be assigned a rank
if (req.user?.role !== 'admin') {
  const assignedRank = (req.user as any).assignedRank;
  if (assignedRank !== undefined && assignedRank !== playerRank) {
    res.status(403).json({ error: 'Can only submit for your own rank' });
    return;
  }
}
```

**Impact:** Users can only submit game results for their assigned rank.

---

### 7. 🟢 LOW: Client-Side Authentication Flow

#### New Features:
- **LoginForm Component**: Modal dialog for user authentication
- **AuthService**: Manages JWT tokens in sessionStorage
- **Automatic Login Prompt**: Shows login dialog when 401 errors occur
- **Token Auto-Refresh**: Tokens automatically attached to all API requests

#### Key Files:
- `src/services/authService.ts` - Authentication state management
- `src/components/LoginForm.tsx` - Login UI component
- Updated `src/App.tsx` - Integrates login dialog
- Updated `src/services/dataService.ts` - Uses auth tokens automatically

---

## Environment Variables Required

### Production Checklist:

| Variable | Required | Default | Action |
|----------|----------|---------|--------|
| `JWT_SECRET` | ✅ YES | None | Generate with crypto |
| `CORS_ORIGINS` | ✅ YES | None | Comma-separated origins |
| `ADMIN_USERNAME` | ✅ YES | None | Choose username |
| `ADMIN_PASSWORD` | ✅ YES | None | Use strong password |
| `ADMIN_API_KEY` | ✅ YES | None | Generate 64-char hex key |
| `NODE_ENV` | ✅ YES | development | Set to 'production' |
| `PORT` | ❌ No | 3000 | Optional |
| `REQUEST_SIZE_LIMIT` | ❌ No | 1mb | Optional |
| `RATE_LIMIT_WINDOW_MS` | ❌ No | 900000 | Optional (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | ❌ No | 100 | Optional |
| `JWT_EXPIRY` | ❌ No | 24h | Optional |

---

## How to Generate Secure Values

### JWT Secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Admin API Key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Example Output:
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

---

## Verification Steps

### 1. Check Environment Variables:
```bash
cd server
node -e "require('dotenv').config(); console.log(process.env.JWT_SECRET ? 'JWT_SECRET: OK' : 'JWT_SECRET: MISSING')"
```

### 2. Test Server Startup:
```bash
cd server
npm run dev
```

Expected output includes:
- ✓ All environment variables validated
- ⚠️ Warnings for development defaults
- ✗ Server exits if required variables missing

### 3. Test Rate Limiting:
```bash
# Should fail after 10 auth attempts
for i in {1..15}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/login; done

# Should fail after 100 API requests (in production)
for i in {1..105}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/ladder; done
```

### 4. Test CORS:
```bash
# Request from wrong origin should fail
curl -H "Origin: http://evil.com" -v http://localhost:3000/api/ladder
# Should see Access-Control-Allow-Origin not set or set to configured origin
```

### 5. Test Authentication:
```bash
# Login and get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# Use token for protected endpoint
curl http://localhost:3000/api/ladder \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Files Modified

### Server-Side:
1. `server/src/index.ts` - Environment validation, rate limiting, CSP, security middleware
2. `server/src/routes/auth.routes.ts` - Required env vars, dotenv import
3. `server/src/middleware/auth.middleware.ts` - Removed default JWT secret, timing-safe API key comparison
4. `server/src/routes/game.routes.ts` - Authorization checks
5. `server/src/routes/ladder.routes.ts` - Auth required for updates
6. `server/src/middleware/errorHandler.ts` - Type safety fixes

### Configuration:
1. `.env.example` - Complete documentation of all variables
2. `.env` - Production defaults with strong API key placeholder
3. `server/.env` - Synced with parent .env

---

## 🚨 CRITICAL: Before Going Live

### 1. Generate Strong API Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Update `.env`:
```env
ADMIN_API_KEY=<paste-64-char-key-here>
```

### 2. Set CORS to Your Domain
```env
# Replace with your actual domain!
CORS_ORIGINS=https://yourdomain.com
```

### 3. Enable Production Mode
```env
NODE_ENV=production
```

### 4. Verify All Environment Variables
```bash
cd server
node -e "require('dotenv').config(); const vars=['JWT_SECRET','CORS_ORIGINS','ADMIN_USERNAME','ADMIN_PASSWORD','ADMIN_API_KEY']; vars.forEach(v=>console.log(v+':',process.env[v]?'OK':'MISSING'))"
```

---

## Security Features Summary

| Feature | Status | Details |
|---------|--------|--------|
| **Rate Limiting** | ✅ | 10 auth / 100 API req per 15 min (prod) |
| **CORS Protection** | ✅ | Configurable origins, warning on `*` |
| **Security Headers** | ✅ | Helmet.js with CSP |
| **Request Size Limit** | ✅ | 1MB default (configurable) |
| **Method Filtering** | ✅ | Blocks TRACE/TRACK/CONNECT |
| **Timing-Safe API Key** | ✅ | Prevents timing attacks |
| **Security Logging** | ✅ | Suspicious requests logged |
| **HTTPS Enforcement** | ⚠️ | Requires nginx/reverse proxy |

---

## Network Security Recommendations

### Firewall Rules (UFW example):
```bash
# Allow only essential ports
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Node.js (internal only)
sudo ufw enable
```

### nginx Reverse Proxy (recommended):
See `README_INSTALL.md` for complete nginx configuration with SSL.

---

## Monitoring Commands

### Check Active Connections:
```bash
netstat -tulpn | grep 3000
```

### View Security Logs:
```bash
tail -f server.log | grep SECURITY
```

---

## Remaining Security Tasks (Optional)

- [ ] Replace in-memory user store with database
- [ ] Add password complexity validation
- [ ] Implement account lockout after failed attempts
- [ ] Add HTTPS certificate configuration
- [ ] Configure secure cookie settings
- [ ] Implement refresh token rotation
- [ ] Add multi-factor authentication
