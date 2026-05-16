# Security Configuration

**Version: 1.2.1**

## Environment Variables

### Required in Production

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Must be `production` | `production` |
| `CORS_ORIGINS` | Allowed frontend domains, comma-separated | `https://your-domain.com` |
| `ADMIN_API_KEY` | Protects admin endpoints (`/api/admin/*`) | `a1b2c3d4e5f6...` |
| `USER_API_KEY` | Protects write operations (PUT/POST/DELETE) | `f6e5d4c3b2a1...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |

### Example Production `.env`

```env
PORT=3000
NODE_ENV=production
CORS_ORIGINS=https://your-domain.com
ADMIN_API_KEY=a1b2c3d4e5f6...
USER_API_KEY=f6e5d4c3b2a1...
```

**Both `ADMIN_API_KEY` and `USER_API_KEY` are required in production. The server will refuse to start if either is missing.**

### Single-Key Mode

Set both keys to the same value for simpler setups:

```env
USER_API_KEY=my-shared-key
ADMIN_API_KEY=my-shared-key
```

## Access Levels

| Key Status | Read (GET) | Write (PUT/POST/DELETE) | Admin (`/api/admin/*`) |
|------------|-----------|------------------------|----------------------|
| No key / wrong key | ✅ | ❌ | ❌ |
| Valid user key | ✅ | ✅ | ❌ |
| Valid admin key | ✅ | ✅ | ✅ |

**Notes:**
- Admin key grants all permissions (admin + write). User key only allows write operations.
- In production, both keys are required — the server refuses to start without them.
- In development (`NODE_ENV` not set to `production`), no keys are required and all operations are allowed.
- If `ADMIN_API_KEY` is set but `USER_API_KEY` is not, admin key also works for writes.

## Security Features

### 1. CORS Protection

Only requests from configured origins are allowed. The `CORS_ORIGINS` env var is parsed and applied to the cors() middleware.

**Configuration:**
```env
CORS_ORIGINS=https://your-domain.com,https://another-domain.com
```

### 2. API Key Authentication

Keys are sent via the `X-API-Key` header. Admin keys use timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing attacks.

**Generate keys:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Rate Limiting

| Scope | Production | Development |
|-------|-----------|-------------|
| Write endpoints (ladder/games/admin) | 30 req / 15 min | 100 req / 15 min |
| General API | 100 req / 15 min | 1000 req / 15 min |
| Admin lock (status checks) | 600 req / 1 min | 600 req / 1 min |

### 4. Helmet.js Security Headers

Applied in production: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Strict-Transport-Security`, and more.

### 5. Content Security Policy (Production Only)

Prevents XSS attacks by restricting script sources to `'self'`. Configured `connectSrc` uses the first entry from `CORS_ORIGINS`.

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGINS` to your domain(s) (required)
- [ ] Generate `ADMIN_API_KEY` (required in production)
- [ ] Generate `USER_API_KEY` (required in production)
- [ ] Configure SSL/TLS via nginx or reverse proxy (see [README_INSTALL.md](./README_INSTALL.md))
- [ ] Enable firewall rules

## Network Security

### Firewall (UFW)

```bash
sudo ufw allow 'Nginx Full'   # HTTP/HTTPS only
sudo ufw deny 3000             # Block direct server access
sudo ufw enable
```

### Nginx Reverse Proxy

See [README_INSTALL.md](./README_INSTALL.md) for complete nginx configuration with SSL.

## Client-Side Security

The API key is stored in browser localStorage and sent with API requests. Always use HTTPS in production to encrypt this traffic.

---

*For deployment instructions, see [README_INSTALL.md](./README_INSTALL.md). For admin operations, see [ADMIN_MANUAL.md](./ADMIN_MANUAL.md).*
