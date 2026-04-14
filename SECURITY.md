# Security Configuration

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
CORS_ORIGIN=https://your-domain.com
```

**Behavior:**
- Only requests from configured origin are allowed
- Production warning if `*` is used
- Credentials (cookies) supported when needed

### 2. Admin API Key Protection (Optional)

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

**Note:** Admin API key is optional. If not set, admin endpoints are publicly accessible (suitable for local/development use).

### 3. Rate Limiting

**Purpose:** Prevent abuse and DoS attacks

**Default Settings:**
- 100 requests per 15 minutes (production)
- 1000 requests per 15 minutes (development)

**Configuration:**
```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. Helmet.js Security Headers

**Purpose:** Set secure HTTP headers

**Headers Applied:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HTTPS only)
- And more...

### 5. Content Security Policy (Production Only)

**Purpose:** Prevent XSS attacks

**Applied in production only.** Development mode disables CSP for easier debugging.

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|--------|
| `NODE_ENV` | Environment mode | `production` |
| `CORS_ORIGIN` | Allowed frontend domain | `https://omen.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `ADMIN_API_KEY` | Admin endpoint protection | None (open) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` (prod), `1000` (dev) |

---

## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGIN` to your domain (required)
- [ ] Generate `ADMIN_API_KEY` if using admin endpoints (optional)
- [ ] Configure SSL/TLS (via nginx or reverse proxy)
- [ ] Enable firewall rules

### Example Production `.env`

```env
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://omen.com
ADMIN_API_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

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
4. Optionally enter API key if server has admin protection enabled
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
node -e "require('dotenv').config(); console.log('CORS:', process.env.CORS_ORIGIN || '(not set)'); console.log('Admin Key:', process.env.ADMIN_API_KEY ? 'Set' : '(not set)')"
```

### Test CORS Configuration

```bash
# Request from wrong origin should fail
curl -H "Origin: http://evil.com" -v http://localhost:3000/api/ladder
# Should see Access-Control-Allow-Origin not set or set to configured origin
```

---

## No Authentication Required

This application does **not** implement user authentication:
- No username/password login
- No JWT tokens
- No session management

Security is achieved through:
1. Optional admin API key for sensitive endpoints
2. CORS protection
3. Rate limiting
4. Network-level security (firewall, SSL)
