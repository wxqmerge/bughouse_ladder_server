# Security Configuration

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
| `ANON_HIDE_PII` | Strip `phone`, `school`, `room`, and `info` from `GET /api/ladder`, `GET /api/ladder/:rank`, and `GET /api/ladder/mini-games/read` when no valid API key is sent (view-only visitors). **ON by default** — set to `false` only to knowingly expose contact fields | on |
| `TRUST_PROXY` | Reverse-proxy hops trusted for `X-Forwarded-For`. Set `0` if the node port is directly exposed (prevents spoofed-IP rate-limit bypass) | `1` |
| `MAX_SSE_CLIENTS` | Global cap on simultaneous unauthenticated SSE connections (excess gets `503`) | `200` |
| `SSE_MAX_CONNECTS_PER_IP` | SSE connect budget per IP per 15 min | `120` |

> **Environment precedence:** systemd `EnvironmentFile=` entries *override*
> `Environment=` lines in the unit file. Never set `NODE_ENV` in a deployed
> `server/.env` — the service unit owns it. `deploy/update.sh` [3.2/10] aborts
> and `deploy/verify.sh` section 20 fails if `.env` would downgrade the
> instance. `GET /health` reports the live `env` so this is checkable remotely.

### Example Production `.env`

```env
PORT=3000
NODE_ENV=production
CORS_ORIGINS=https://your-domain.com
ADMIN_API_KEY=a1b2c3d4e5f6...
USER_API_KEY=f6e5d4c3b2a1...
```

**Both `ADMIN_API_KEY` and `USER_API_KEY` are required in production. The server will refuse to start if either is missing.**

### Protected Server Key File

Prefer moving server API keys out of `server/.env` into a protected systemd environment file:

```bash
cd /var/www/html/bughouse-ladder-app
sudo bash ./deploy/secure-env.sh your-admin-user
sudo bash ./deploy/rotate-key-all.sh
```

Keys are stored under `/etc/bughouse-ladder/<instance>.env` and passed to the service with systemd `EnvironmentFile`. The admin deployment group can read the protected file; the service user does not need filesystem access. Re-login after group membership changes.

Use `ROTATE_ADMIN_KEY` and `ROTATE_USER_KEY`, or Enter at the hidden prompts, to avoid passing secrets as command-line arguments. The rotation report is written to a mode-`0600` file under `$HOME`.

**Rotation checklist:** migrate every instance before rotating → restart + verify services → regenerate browser shortcuts with `deploy/create_html.sh` and `shred -u` the file after import → refresh PWA/localStorage keys → confirm old keys get `401` → delete backups and reports.

Local development keys: use `deploy/update-env-key.ps1` (hidden prompt, writes gitignored `.env` files only). Never hardcode keys in scripts, tests, or docs.

> History note: a partial config-URL key fragment existed in `USER_MANUAL.md` (commits `edbc435`..`7e23fce`). Removed from the current tree; treat that key as exposed and rotate it.

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

| Scope | Limit |
|-------|-------|
| Write endpoints (ladder/games mini-game writes) | 500 req / 15 min |
| General API | 5000 req / 15 min |
| SSE connects (per IP, new connections only) | 120 / 15 min + global cap of 200 open connections |
| Admin lock polling | 1200 req / min |

### 4. Helmet.js Security Headers

Applied in production: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Strict-Transport-Security`, and more.

### 5. Content Security Policy (Production Only)

Prevents XSS attacks by restricting script sources to `'self'`. Configured `connectSrc` uses the first entry from `CORS_ORIGINS`.

> Note: this CSP only covers responses served by the Node server. In production nginx serves the `/dist/` frontend directly — add the same headers there (see `deploy/nginx/csp.conf`).

## Known Limitations / Accepted Risks

- **SSE endpoint (`/api/ladder/events`) is unauthenticated** and answers with `Access-Control-Allow-Origin: *`. `EventSource` cannot send custom headers, so keying it would mean `?key=` in the URL — which reintroduces the nginx access-log leak. The event stream is therefore metadata-only (ranks, counts, file names): admin broadcasts deliberately carry **no names or player fields** (enforced — see `playerRemovedFromAll`/`playerUpdatedInAll` in `server/src/routes/admin.routes.ts`). Connection-count abuse is bounded by `MAX_SSE_CLIENTS` (global, 503 over cap) and `SSE_MAX_CONNECTS_PER_IP` (per-IP connect rate); the SSE route is excluded from the general API limiter bucket so reconnect storms can't lock out other traffic.
- **The API key is a shared club secret**, not a per-user credential. All write-key holders are mutually trusted (bulk writes replace the player list).
- **Config shortcut URLs** (`?key=`) put the live key in bookmarks, browser history, and (until `access_log off` is applied — see `deploy/fix-dist-nolog.sh`) nginx access logs.
- **Unauthenticated reads hide PII by default** (`ANON_HIDE_PII` is ON unless explicitly set to `false`); with a valid key, `phone`/`school`/`room`/`info` are included.
- **`GET /health` is unauthenticated** and exposes version, runtime mode (`env`), and write-health counters. The `lastError` string (which can contain filesystem paths) is only returned to requests carrying a valid API key; clients send the stored key on health checks.
- **`TRUST_PROXY` defaults to `1`** (behind nginx). If the node port is ever exposed directly, clients can spoof `X-Forwarded-For` to pick their own rate-limit buckets — set `TRUST_PROXY=0` or keep the firewall rule (`ufw deny 3000`) enforced. `deploy/verify.sh` checks nginx/firewall posture.
- **Nginx log protection is deployed** (`access_log off` on dist paths via the parent-domain regex location, plus `/etc/nginx/conf.d/nolog-key.conf` map so subdomain vhosts can log with `if=$log_without_key`). Verified by `deploy/verify.sh` section 19; audit other apps with `deploy/fix-dist-nolog.sh --dry-run`.
- **Auth brute-force budget:** every limiter above applies to authenticated
  endpoints too (they all sit under `/api`). Keys are 32-64 hex (128-256 bit),
  making brute force infeasible; add stricter per-route limiters if that
  assumption ever changes (e.g., short keys for kids' devices).
- **Build-time-only dev advisories:** the frontend dev toolchain (vite/vitest/esbuild) carries moderate/high advisories fixable only by major upgrades (`vite@8`). They never run in production (systemd serves `node dist/index.js`; nginx serves static `dist/`), so they are accepted risk until the major is scheduled.

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGINS` to your domain(s) (required)
- [ ] Generate `ADMIN_API_KEY` (required in production)
- [ ] Generate `USER_API_KEY` (required in production)
- [ ] Migrate keys to protected storage: `sudo bash ./deploy/secure-env.sh <admin-user>`
- [ ] Apply log-leak fix: `sudo bash ./deploy/fix-dist-nolog.sh` (then `--test --purge-logs`)
- [ ] Apply CSP headers in the parent nginx vhost (`deploy/nginx/csp.conf`)
- [ ] Set `ANON_HIDE_PII=true` (view-only deployments)
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
