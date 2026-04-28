# Staging Instance Setup Guide

Run a second instance of the Bughouse Ladder server on the same machine for testing and staging.

## Quick Comparison

| | Production | Staging |
|---|---|---|
| Port | `3000` | `3001` |
| Systemd service | `bughouse-ladder` | `bughouse-ladder-staging` |
| Data directory | `server/data/` | `server/data-staging/` |
| Env file | `server/.env` | `server/.env.staging` |
| Nginx location | `/api/` | `/api-staging/` |
| Client URL | `https://your-domain.com` | `https://staging.your-domain.com` |

## Prerequisites

- Production instance already installed and running
- Same codebase — no separate clone needed

---

## Step 1: Create Staging Data Directory

```bash
sudo mkdir -p /var/www/bughouse-ladder/server/data-staging
sudo chown www-data:www-data /var/www/bughouse-ladder/server/data-staging
sudo chmod 755 /var/www/bughouse-ladder/server/data-staging
```

This keeps staging ladder data completely separate from production.

---

## Step 2: Create Staging Environment File

```bash
cd /var/www/bughouse-ladder/server
cp .env .env.staging
nano .env.staging
```

Edit `server/.env.staging`:

```env
PORT=3001
NODE_ENV=production
CORS_ORIGINS=https://staging.your-domain.com
TAB_FILE_PATH=./data-staging/ladder.tab
REQUEST_SIZE_LIMIT=1mb
USER_API_KEY=
ADMIN_API_KEY=
```

Key differences from production:
- `PORT=3001` (not 3000)
- `CORS_ORIGINS` set to your staging domain
- `TAB_FILE_PATH` points to `data-staging/`

---

## Step 3: Build

No separate build needed — the same `dist/` directory serves both instances. Just ensure the latest code is built:

```bash
cd /var/www/bughouse-ladder
npm run build
cd server && npm run build && cd ..
```

---

## Step 4: Create Systemd Service

```bash
sudo nano /etc/systemd/system/bughouse-ladder-staging.service
```

```ini
[Unit]
Description=Bughouse Chess Ladder Server (Staging)
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/bughouse-ladder/server
EnvironmentFile=/var/www/bughouse-ladder/server/.env.staging
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Key differences:
- `EnvironmentFile` points to `.env.staging` (not `.env`)
- Service name includes `-staging`

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bughouse-ladder-staging
sudo systemctl start bughouse-ladder-staging

# Verify
sudo systemctl status bughouse-ladder-staging
```

---

## Step 5: Configure Nginx

Add a new server block for staging:

```bash
sudo nano /etc/nginx/sites-available/bughouse-ladder-staging
```

```nginx
server {
    listen 80;
    server_name staging.your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Frontend — serve same dist directory
    location / {
        root /var/www/bughouse-ladder/dist;
        try_files $uri $uri/ /index.html;
    }

    # API reverse proxy to staging server
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # Health check
    location = /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
        allow all;
    }
}
```

> **Note:** SSL certs use the same certificate as production (`your-domain.com`). If you have a wildcard cert (`*.your-domain.com`), it covers staging automatically. Otherwise, generate a separate cert:
> ```bash
> sudo certbot --nginx -d staging.your-domain.com
> ```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/bughouse-ladder-staging /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 6: Configure Client for Staging

Users access staging at `https://staging.your-domain.com`. To auto-configure the server URL:

```
https://staging.your-domain.com/?config=1&server=https://staging.your-domain.com
```

Or manually: **Operations → Settings** → Server URL: `https://staging.your-domain.com`

---

## Managing Both Instances

### Start/Stop/Restart

```bash
# Production
sudo systemctl start|stop|restart|status bughouse-ladder

# Staging
sudo systemctl start|stop|restart|status bughouse-ladder-staging
```

### View Logs

```bash
# Production
sudo journalctl -u bughouse-ladder -f

# Staging
sudo journalctl -u bughouse-ladder-staging -f
```

### Check Ports

```bash
sudo lsof -i :3000  # Production
sudo lsof -i :3001  # Staging
```

### Update Both

```bash
cd /var/www/bughouse-ladder
git pull
npm run build
cd server && npm run build && cd ..
sudo systemctl restart bughouse-ladder
sudo systemctl restart bughouse-ladder-staging
```

---

## Troubleshooting

### Service won't start

```bash
# Check error logs
sudo journalctl -u bughouse-ladder-staging -n 50 --no-pager

# Verify env file is readable
sudo -u www-data cat /var/www/bughouse-ladder/server/.env.staging

# Test server directly
sudo -u www-data node /var/www/bughouse-ladder/server/dist/index.js
```

### CORS errors in staging browser

Ensure `CORS_ORIGINS` in `.env.staging` matches the exact origin (no trailing slash):

```env
CORS_ORIGINS=https://staging.your-domain.com
```

### Port conflict

```bash
# Check what's on port 3001
sudo lsof -i :3001

# Kill the process if needed
sudo fuser -k 3001/tcp
```

### Data isolation verification

```bash
# Production data
ls -la /var/www/bughouse-ladder/server/data/

# Staging data
ls -la /var/www/bughouse-ladder/server/data-staging/
```

### Nginx 502 on staging

```bash
# Check if staging server is running
curl http://localhost:3001/health

# Check nginx error log
sudo tail -f /var/log/nginx/error.log
```
