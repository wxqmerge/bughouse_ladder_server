# Bughouse Chess Ladder - Production Installation Guide

**Version: 1.1.0**

**Communication:** TCP/HTTP (NOT UDP). Default port is 3000.

This guide provides step-by-step instructions for deploying the Bughouse Chess Ladder application to a production server.

---

## Architecture Overview

**Minimal server-side code** - The application is primarily a client-side React app. The server is a simple data store:

| Component | What It Does |
|-----------|---------------|
| **Frontend** | All game entry, validation, rating calculation in browser |
| **Server** | Stores/retrieves ladder data via REST API |
| **User key** | Optional — protects write operations (PUT/POST/DELETE) |
| **Admin key** | Optional — protects admin endpoints + also grants write access |

Users configure the server URL through the **Settings menu** in the browser - no environment variables needed for most deployments.

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Quick Start](#quick-start)
3. [Manual Installation](#manual-installation)
4. [Configuration](#configuration)
5. [Nginx Setup](#nginx-setup)
6. [Multi-Version Deployment](#multi-version-deployment)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Node.js** | v18.0.0 | v20.x LTS |
| **RAM** | 512 MB | 2 GB |
| **Disk Space** | 500 MB | 2 GB |
| **OS** | Linux (Ubuntu 20.04+) | Ubuntu 22.04 LTS |

---

## Quick Start

### Install Node.js and Git

```bash
# Update system
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git curl nginx
```

### Clone Repository

```bash
sudo mkdir -p /var/www/bughouse-ladder
cd /var/www/bughouse-ladder
git clone <your-repository-url> .
```

### Install Dependencies

```bash
# Frontend dependencies
npm install

# Server dependencies
cd server && npm install && cd ..
```

### Build Application

```bash
# Build frontend
npm run build

# Build server
cd server && npm run build && cd ..

# Create data directories
mkdir -p server/data server/uploads
```

### Configure Server (Minimal)

```bash
cd server
cp .env.example .env
cat > .env << EOF
PORT=3000
NODE_ENV=production
CORS_ORIGINS=https://your-domain.com
TAB_FILE_PATH=./data/ladder.tab
REQUEST_SIZE_LIMIT=1mb
USER_API_KEY=
ADMIN_API_KEY=
EOF
cd ..
```

### Start Server

```bash
# Development (with auto-restart)
cd server && npm run dev

# Production (manual start)
sudo systemctl start bughouse-ladder  # If using systemd service
```

---

## Manual Installation

### Step 1: Update System

```bash
sudo apt update && sudo apt upgrade -y

# Install Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### Step 2: Create Application Directory

```bash
sudo mkdir -p /var/www/bughouse-ladder
sudo chown $USER:$USER /var/www/bughouse-ladder
cd /var/www/bughouse-ladder
```

### Step 3: Clone Repository

```bash
git clone <your-repository-url> .
```

### Step 4: Install Dependencies

```bash
# Frontend dependencies
npm install

# Server dependencies
cd server
npm install
cd ..
```

### Step 5: Configure Server

**Create `.env` file:**

```bash
cd server
cp .env.example .env
nano .env
```

Edit `server/.env`:

```env
PORT=3000
NODE_ENV=production

# REQUIRED: Your production domain(s) for CORS security, comma-separated
CORS_ORIGINS=https://your-domain.com

# OPTIONAL: Path to ladder data file (default: ./data/ladder.tab)
TAB_FILE_PATH=./data/ladder.tab

# OPTIONAL: Max request body size (default: 1mb)
REQUEST_SIZE_LIMIT=1mb

# OPTIONAL: API keys for protecting operations
# User key — protects write operations (PUT/POST/DELETE). Without key: read-only.
# Admin key — protects admin endpoints + also grants write access.
# Set one key to the same value for all-access, or separate them. Leave empty for local/dev.
USER_API_KEY=
ADMIN_API_KEY=
```

**Key values explained:**
- `CORS_ORIGINS` - **Required** - Your domain(s) (e.g., `https://your-domain.com`), comma-separated. Prevents cross-site attacks.
- `USER_API_KEY` - Optional — protects write operations. Admin key also works here.
- `ADMIN_API_KEY` - Optional — protects admin endpoints. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Step 6: Build Application

```bash
cd ..

# Build frontend (creates dist/ directory)
npm run build

# Build server TypeScript
cd server
npm run build
cd ..

# Create data directories
mkdir -p server/data server/uploads
chmod 755 server/data server/uploads
```

### Step 7: Configure Nginx

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/bughouse-ladder
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # Redirect HTTP to HTTPS (uncomment when SSL is configured)
    # return 301 https://$server_name$request_uri;
    
    # Frontend static files
    location / {
        root /var/www/bughouse-ladder/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # API reverse proxy
    location /api/ {
        proxy_pass http://localhost:3000;
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
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

> **Note:** For multi-version deployments, use subdomains where the subdomain matches the project directory name (e.g., `dev-ladder.your-domain.com` for the `dev-ladder` project). See [Multi-Version Deployment](#multi-version-deployment) below.

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/bughouse-ladder /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default config
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

### Step 8: Configure SSL with Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain and configure SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal is configured automatically
# Test renewal:
sudo certbot renew --dry-run
```

### Step 9: Create Systemd Service (Optional but Recommended)

**Purpose:** Run the server as a background service that starts on boot and auto-restarts on crash.

**Note:** This step is optional - you can run the server manually instead. See "Manual Server Start" below.

Create service file:

```bash
sudo nano /etc/systemd/system/bughouse-ladder.service
```

Add the following:

```ini
[Unit]
Description=Bughouse Chess Ladder Server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/bughouse-ladder/server
Environment=NODE_ENV=production
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

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bughouse-ladder
sudo systemctl start bughouse-ladder

# Verify status
sudo systemctl status bughouse-ladder
```

### Manual Server Start (Alternative to Systemd)

If you don't want to use systemd, simply run:

```bash
cd /var/www/bughouse-ladder/server
NODE_ENV=production node dist/index.js
```

To run in background:
```bash
nohup NODE_ENV=production node dist/index.js > server.log 2>&1 &
```

---

## Configuration

### Server Environment Variables

| Variable | Required? | Description |
|----------|-----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | Yes | Set to `production` |
| `CORS_ORIGINS` | **Yes** | Your domain(s) (e.g., `https://your-domain.com`), comma-separated |
| `TAB_FILE_PATH` | No | Path to ladder data file (default: `./data/ladder.tab`) |
| `REQUEST_SIZE_LIMIT` | No | Max request body size (default: `1mb`) |
| `USER_API_KEY` | Optional | API key for write operations (PUT/POST/DELETE) |
| `ADMIN_API_KEY` | Optional | API key for admin endpoints (/api/admin/*) |

### Client-Side Server Configuration

Users can configure the application in three ways:

#### Method 1: Settings Dialog (Interactive)

1. Open the application
2. Click **Operations → Settings**
3. Enter server URL (e.g., `your-domain.com:3000` or `http://localhost:3000`)
4. Optionally enter API key — user key allows editing, admin key grants full admin access
5. Click **Save** - page reloads with new configuration

#### Method 2: URL-Based Setup (One-Click)

Share a single URL with users to auto-configure everything:

| Config | URL Format | Purpose |
|--------|------------|---------|
| Server + API key | `?config=1&server=http://host:port&key=yourkey` | Full server connection (user or admin key) |
| Local mode | `?config=2` | Reset to local (no server) |
| Remote file load | `?config=3&file=http://host/file.tab` | Fetch and load .tab/.xls from URL |

**Example for production deployment:**
```
http://your-domain.com/?config=1&server=http://your-server:port&key=your-api-key-here
```

#### Method 3: Drag & Drop (Local Files)

On the splash screen, drag a `.tab`, `.xls`, or `.txt` file onto the drop zone. No server needed — loads directly into local mode.

All settings are stored in the browser's localStorage and persist across sessions.

### Generate API Keys (Optional)

```bash
# User API Key — protects write operations
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Admin API Key — protects admin endpoints
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Use the same key for both if you want one key to cover everything
```

---

## Nginx Setup

### Production Nginx Configuration with SSL

```nginx
# HTTP server - redirect to HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;
    
    # SSL Configuration (set by Certbot)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Frontend static files with caching
    location / {
        root /var/www/bughouse-ladder/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API reverse proxy
    location /api/ {
        proxy_pass http://localhost:3000;
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
    
    # Health check (no auth required)
    location = /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
        allow all;
    }
}
```

---

## Multi-Version Deployment

To run multiple ladder versions (e.g., development and release) on the same server, each version runs as a separate systemd service on its own port, with Nginx routing traffic via subdomains.

### Naming Convention

**SUBDOMAIN == PROJECT_NAME** — The subdomain always matches the project directory name:

- Directory: `/var/www/html/dev-ladder` → Subdomain: `dev-ladder.your-domain.com`
- Directory: `/var/www/html/rel-ladder` → Subdomain: `rel-ladder.your-domain.com`

### Architecture

```
Browser → your-domain.com/dev-ladder/dist/ → dev-ladder.your-domain.com (HTTPS) → Nginx → localhost:3000
Browser → your-domain.com/rel-ladder/dist/ → rel-ladder.your-domain.com (HTTPS) → Nginx → localhost:3001
```

### Service Files

Each ladder version needs a systemd service file.

**dev-ladder.service** (`/etc/systemd/system/dev-ladder.service`):

```ini
[Unit]
Description=Bughouse Chess Ladder - Development
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/bughouse-ladder/deploy/instances/dev-ladder
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**rel-ladder.service** (`/etc/systemd/system/rel-ladder.service`):

```ini
[Unit]
Description=Bughouse Chess Ladder - Release
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/bughouse-ladder/deploy/instances/rel-ladder
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Deploying Service Files

```bash
# Copy service files from deploy directory
sudo cp deploy/instances/dev-ladder/dev-ladder.service /etc/systemd/system/
sudo cp deploy/instances/rel-ladder/rel-ladder.service /etc/systemd/system/

# Enable and start both services
sudo systemctl daemon-reload
sudo systemctl enable dev-ladder rel-ladder
sudo systemctl start dev-ladder rel-ladder

# Verify both are running
sudo systemctl status dev-ladder rel-ladder
```

### Nginx Configuration for Multiple Versions

**dev-ladder.your-domain.com** (`/etc/nginx/sites-available/dev-ladder.your-domain.com.conf`):

```nginx
server {
    listen 80;
    server_name dev-ladder.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**rel-ladder.your-domain.com** (`/etc/nginx/sites-available/rel-ladder.your-domain.com.conf`):

```nginx
server {
    listen 80;
    server_name rel-ladder.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Deploying Nginx Configs

```bash
# Copy configs to Nginx
sudo cp deploy/nginx/dev-ladder.<hostname>.conf /etc/nginx/sites-available/dev-ladder.<hostname>.conf
sudo cp deploy/nginx/rel-ladder.<hostname>.conf /etc/nginx/sites-available/rel-ladder.<hostname>.conf

# Enable them (symlink)
sudo ln -s /etc/nginx/sites-available/dev-ladder.<hostname>.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/rel-ladder.<hostname>.conf /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

### Frontend Config Strings

**Development:**
```
https://your-domain.com/dev-ladder/dist/?config=1&server=https://dev-ladder.your-domain.com&key=mykey
```

**Release:**
```
https://your-domain.com/rel-ladder/dist/?config=1&server=https://rel-ladder.your-domain.com&key=mykey
```

### SSL for Multiple Subdomains

```bash
sudo certbot --nginx -d dev-ladder.your-domain.com
sudo certbot --nginx -d rel-ladder.your-domain.com
```

### Tracing Logs

```bash
# Live logs for dev-ladder
sudo journalctl -u dev-ladder -f

# Live logs for rel-ladder
sudo journalctl -u rel-ladder -f
```

### Managing Services

```bash
# Restart a specific version
sudo systemctl restart dev-ladder
sudo systemctl restart rel-ladder

# Check status
sudo systemctl status dev-ladder
sudo systemctl status rel-ladder

# Stop a version
sudo systemctl stop dev-ladder
```

---

## Verification

### 1. Check Server Health

```bash
# Local health check
curl http://localhost:3000/health

# Through Nginx
curl https://your-domain.com/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

### 2. Check Frontend

```bash
# Verify frontend is served
curl -I https://your-domain.com/
```

Should return `HTTP/2 200` with `Content-Type: text/html`.

### 3. Check API

```bash
# Test API endpoint (should return CORS or method error, not 404)
curl -I https://your-domain.com/api/ladder
```

### 4. Check Service Status

```bash
# Single version
sudo systemctl status bughouse-ladder

# Multi-version
sudo systemctl status dev-ladder
sudo systemctl status rel-ladder
```

Should show `active (running)`.

---

## Troubleshooting

### Server Won't Start

```bash
# Check logs (single version)
sudo journalctl -u bughouse-ladder -n 50 --no-pager

# Check logs (multi-version)
sudo journalctl -u dev-ladder -n 50 --no-pager
sudo journalctl -u rel-ladder -n 50 --no-pager

# Check if port is in use
sudo lsof -i :3000
sudo lsof -i :3001

# Test server directly
cd /var/www/bughouse-ladder/server
NODE_ENV=production node dist/index.js
```

### Nginx 502 Bad Gateway

```bash
# Check if backend is running (single version)
sudo systemctl status bughouse-ladder

# Check if backend is running (multi-version)
sudo systemctl status dev-ladder
sudo systemctl status rel-ladder

# Test backend directly
curl http://localhost:3000/health
curl http://localhost:3001/health

# Check Nginx error log
sudo tail -f /var/log/nginx/error.log
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Test auto-renewal
sudo certbot renew --dry-run
```

### Permission Denied Errors

```bash
# Fix ownership
sudo chown -R www-data:www-data /var/www/bughouse-ladder

# Fix permissions
sudo chmod -R 755 /var/www/bughouse-ladder
sudo chmod 600 /var/www/bughouse-ladder/server/.env
```

### CORS Errors in Browser

Check that `CORS_ORIGINS` in `server/.env` matches your domain exactly:

```env
# Correct - must match browser's origin
CORS_ORIGINS=https://your-domain.com  
CORS_ORIGINS=https://your-domain.com

# Wrong - trailing slash, http instead of https
CORS_ORIGINS=https://your-domain.com/
CORS_ORIGINS=http://your-domain.com
```

---

## Maintenance

### Update Application

```bash
cd /var/www/bughouse-ladder

# Pull latest changes (if using Git)
git pull

# Rebuild
npm run build
cd server && npm run build && cd ..

# Restart service (single version)
sudo systemctl restart bughouse-ladder

# Restart services (multi-version)
sudo systemctl restart dev-ladder rel-ladder
```

### Backup Data

```bash
# Create backup
sudo tar -czf /var/backups/bughouse-ladder-$(date +%Y%m%d).tar.gz \
  /var/www/bughouse-ladder/server/data \
  /var/www/bughouse-ladder/server/uploads
```

### View Logs

```bash
# Application logs (single version)
sudo journalctl -u bughouse-ladder -f

# Application logs (multi-version)
sudo journalctl -u dev-ladder -f
sudo journalctl -u rel-ladder -f

# Nginx access log
sudo tail -f /var/log/nginx/access.log

# Nginx error log
sudo tail -f /var/log/nginx/error.log
```

---

## Security Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGINS` to your production domain(s) (required)
- [ ] Configured SSL/TLS with Let's Encrypt
- [ ] Generated `USER_API_KEY` if write protection needed (optional)
- [ ] Generated `ADMIN_API_KEY` if admin endpoints protected (optional)
- [ ] Enabled firewall (UFW):
  ```bash
  sudo ufw allow 'Nginx Full'
  sudo ufw enable
  ```
- [ ] Restricted `.env` file permissions:
  ```bash
  chmod 600 /var/www/bughouse-ladder/server/.env
  ```

---

## Support

For issues or questions, please open an issue on the GitHub repository.
