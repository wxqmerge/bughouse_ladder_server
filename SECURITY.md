# Security Configuration

**Version: 1.0.1**

## Development Debug Logging (Non-Production)

In development mode (`NODE_ENV != production`), failed admin API key attempts are logged with masked key comparison:

```
[ADMIN_AUTH] 401 - Invalid API key | IP: ::1 | Path: /api/admin-lock/acquire | Provided: "6ccd****b0cf" (64 chars) | Expected: "CHANGE****CRYPTO" (62 chars)
```

Keys are masked (first 4 + last 4 visible, middle hidden). No logging occurs in production.

## Architecture Overview

### Minimal Server Design

The Bughouse Chess Ladder uses a **minimal server architecture** - the server is essentially a simple data store. All game entry, validation, and rating calculation happens in the browser.

### Storage Model

**LOCAL Mode (no server configured in Settings):**
- All data stored in browser localStorage only
- No server communication
- Data persists only in current browser

**SERVER Mode (server configured via Settings menu):**
- Frontend stores data in localStorage (immediate, fast)
- Background sync sends PUT requests to server
- Server writes to `server/data/ladder.tab` (source of truth)
- Multiple clients can share the same ladder data

---

## Security Features

### 1. CORS Protection

**Purpose:** Prevent unauthorized cross-origin requests

**Configuration:**
```env
CORS_ORIGINS=https://your-domain.com
```

**Behavior:**
- Only requests from configured origin are allowed
- Production warning if `*` is used
- Credentials (cookies) supported when needed

### 2. User API Key Protection (Optional)

**Purpose:** Protect write operations (PUT, POST, DELETE) from unauthorized changes

**Configuration:**
```env
USER_API_KEY=<random-string>
```

**Protected Endpoints:** `PUT /api/ladder*`, `DELETE /api/ladder*`, `POST /api/games/*`

**Behavior:** Without a valid key, users can only **view** data (GET requests). With a valid key, they can edit and save.

### 3. Admin API Key Protection (Optional)

**Purpose:** Protect admin endpoints from unauthorized access

**Configuration:**
```env
ADMIN_API_KEY=<64-character-hex-key>
```

**Protected Endpoints:** `/api/admin/*`

**Usage:** Include header `X-API-Key: <key>` with admin requests

**Generate Key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Key Interaction:** Admin key grants all permissions (admin + write). Setting one key to the admin value covers everything. User key does NOT work for admin endpoints.

### 4. Rate Limiting

**Purpose:** Prevent abuse and DoS attacks

**Default Settings:**
- 100 requests per 15 minutes (production)
- 1000 requests per 15 minutes (development)

**Configuration:**
```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 5. Helmet.js Security Headers

**Purpose:** Set secure HTTP headers

**Headers Applied:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HTTPS only)
- And more...

### 6. Content Security Policy (Production Only)

**Purpose:** Prevent XSS attacks

**Applied in production only.** Development mode disables CSP for easier debugging.

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|--------|
| `NODE_ENV` | Environment mode | `production` |
| `CORS_ORIGINS` | Allowed frontend domains (comma-separated) | `https://omen.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `USER_API_KEY` | Write operation protection | None (open) |
| `ADMIN_API_KEY` | Admin endpoint protection | None (open) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` (prod), `1000` (dev) |

---

## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGINS` to your domain(s) (required)
- [ ] Generate `USER_API_KEY` if write protection needed (optional)
- [ ] Generate `ADMIN_API_KEY` if admin endpoints protected (optional)
- [ ] Configure SSL/TLS (via nginx or reverse proxy)
- [ ] Enable firewall rules

### Example Production `.env`

```env
PORT=3000
NODE_ENV=production
CORS_ORIGINS=https://omen.com
USER_API_KEY=change-this-to-a-random-key
ADMIN_API_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### Single-Key Mode (Simpler)

For setups where admin and regular users share one key, set both to the same value:
```env
USER_API_KEY=my-shared-key
ADMIN_API_KEY=my-shared-key
```

Admin operations accept either key. Regular write operations accept either key. Admin-only endpoints require admin key (or user key in single-key mode).

---

## Network Security Recommendations

### Firewall Rules (UFW example)

```bash
# Allow only essential ports
sudo ufw allow 'Nginx Full'  # HTTP/HTTPS
sudo ufw deny 3000           # Block direct server access
sudo ufw enable
```

### Nginx Reverse Proxy (Recommended)

See `README_INSTALL.md` for complete nginx configuration with SSL.

---

## Client-Side Configuration

Users configure the server URL through the **Settings menu** in the browser:

1. Open the application
2. Click **Menu → Settings**
3. Enter server URL (e.g., `omen.com:3000`)
4. Optionally enter API key — user key allows editing/saving, admin key grants full access
5. Click **Save** - page reloads with new configuration

This setting is stored in the browser's localStorage and persists across sessions.

---

## Security Headers Summary

| Header | Value | Purpose |
|--------|-------|--------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Enable XSS filter |
| `Strict-Transport-Security` | `max-age=31536000` | Enforce HTTPS |
| `Content-Security-Policy` | Configured | Prevent XSS (production) |

---

## Monitoring

### Check Server Security Configuration

```bash
cd server
node -e "require('dotenv').config(); console.log('CORS:', process.env.CORS_ORIGINS || '(not set)'); console.log('User Key:', process.env.USER_API_KEY ? 'Set' : '(not set)'); console.log('Admin Key:', process.env.ADMIN_API_KEY ? 'Set' : '(not set)')"
```

### Test CORS Configuration

```bash
# Request from wrong origin should fail
curl -H "Origin: http://evil.com" -v http://localhost:3000/api/ladder
# Should see Access-Control-Allow-Origin not set or set to configured origin
```

---

## Key-Based Access Control

This application uses optional API keys instead of user accounts:
- No username/password login
- No JWT tokens
- No session management

**Access levels:**
1. **No key / wrong key** → Read-only (GET endpoints)
2. **Valid user key** → Can edit/save data (PUT/POST/DELETE on ladder and games)
3. **Admin key** → Full access including admin endpoints (/api/admin/*)

Security is achieved through:
1. Optional user API key for write operations
2. Optional admin API key for admin endpoints
3. CORS protection
4. Rate limiting
5. Network-level security (firewall, SSL)
