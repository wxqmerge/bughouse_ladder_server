# Bughouse Chess Ladder - Production Installation Guide

**Version: 1.0.1**

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
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

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
CORS_ORIGIN=https://your-domain.com
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

# REQUIRED: Your production domain (for CORS security)
CORS_ORIGIN=https://your-domain.com

# OPTIONAL: API keys for protecting operations
# User key — protects write operations (PUT/POST/DELETE). Without key: read-only.
# Admin key — protects admin endpoints + also grants write access.
# Set one key to the same value for all-access, or separate them. Leave empty for local/dev.
USER_API_KEY=
ADMIN_API_KEY=
```

**Key values explained:**
- `CORS_ORIGIN` - **Required** - Your domain (e.g., `https://omen.com`). Prevents cross-site attacks.
- `USER_API_KEY` - Optional — protects write operations. Admin key also works here.
- `ADMIN_API_KEY` - Optional — protects admin endpoints. Generates with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

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
| `CORS_ORIGIN` | **Yes** | Your domain (e.g., `https://omen.com`) |
| `USER_API_KEY` | Optional | API key for write operations (PUT/POST/DELETE) |
| `ADMIN_API_KEY` | Optional | API key for admin endpoints (/api/admin/*) |

### Client-Side Server Configuration

Users can configure the application in three ways:

#### Method 1: Settings Dialog (Interactive)

1. Open the application
2. Click **Menu → Settings**
3. Enter server URL (e.g., `omen.com:3000` or `http://localhost:3000`)
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
curl -I https://your-domain.com/api/players
```

### 4. Check Service Status

```bash
sudo systemctl status bughouse-ladder
```

Should show `active (running)`.

---

## Troubleshooting

### Server Won't Start

```bash
# Check logs
sudo journalctl -u bughouse-ladder -n 50 --no-pager

# Check if port is in use
sudo lsof -i :3000

# Test server directly
cd /var/www/bughouse-ladder/server
NODE_ENV=production node dist/index.js
```

### Nginx 502 Bad Gateway

```bash
# Check if backend is running
sudo systemctl status bughouse-ladder

# Test backend directly
curl http://localhost:3000/health

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

Check that `CORS_ORIGIN` in `server/.env` matches your domain exactly:

```env
# Correct - must match browser's origin
CORS_ORIGIN=https://your-domain.com  
CORS_ORIGIN=https://omen.com

# Wrong - trailing slash, http instead of https
CORS_ORIGIN=https://your-domain.com/
CORS_ORIGIN=http://your-domain.com
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

# Restart service
sudo systemctl restart bughouse-ladder
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
# Application logs
sudo journalctl -u bughouse-ladder -f

# Nginx access log
sudo tail -f /var/log/nginx/access.log

# Nginx error log
sudo tail -f /var/log/nginx/error.log
```

---

## Security Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGIN` to your production domain (required)
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
