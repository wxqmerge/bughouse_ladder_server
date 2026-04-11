# Bughouse Chess Ladder - Production Installation Guide

This guide provides step-by-step instructions for deploying the Bughouse Chess Ladder application to a production server.

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Quick Deploy Script](#quick-deploy-script)
3. [Manual Installation](#manual-installation)
4. [Configuration](#configuration)
5. [Reverse Proxy Setup (Nginx)](#reverse-proxy-setup-nginx)
6. [Systemd Service (Optional)](#systemd-service-optional)
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

## Quick Deploy Script

For automated installation, use the provided deploy script:

```bash
# Clone repository
git clone <your-repository-url> /var/www/bughouse-ladder
cd /var/www/bughouse-ladder

# Run automated deployment
chmod +x deploy.sh
sudo ./deploy.sh
```

---

## Manual Installation

### Step 1: Update System and Install Dependencies

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource for latest LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Git, Nginx, and other utilities
sudo apt install -y git nginx curl

# Verify installations
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
git --version
```

### Step 2: Create Application Directory and User

```bash
# Create application directory
sudo mkdir -p /var/www/bughouse-ladder
sudo chown $USER:$USER /var/www/bughouse-ladder

# Navigate to directory
cd /var/www/bughouse-ladder
```

### Step 3: Clone Repository

```bash
# Clone your repository (replace with actual URL)
git clone <your-repository-url> .

# Or copy files manually if not using Git
# scp user@source:/path/to/files/* /var/www/bughouse-ladder/
```

### Step 4: Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### Step 5: Configure Environment Variables

**Server Configuration:**

```bash
cd server
cp .env.example .env
nano .env
```

Edit `server/.env` with production values:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# JWT Secret - GENERATE A NEW ONE FOR PRODUCTION
JWT_SECRET=<run: openssl rand -base64 32>

# CORS Origin - Your production domain
CORS_ORIGIN=https://your-domain.com

# Admin Credentials - CHANGE THESE IMMEDIATELY
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password-here>

# Tab file path
TAB_FILE_PATH=./data/ladder.tab

# Rate limiting (adjust for production traffic)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Frontend Configuration:**

```bash
cd ..
cp .env.example .env.production
cat > .env.production << EOF
# Frontend Environment Variables
VITE_API_URL=https://your-domain.com/api
production
EOF
```

### Step 6: Build Application

```bash
# Build frontend (creates dist/ directory)
npm run build

# Build server TypeScript
cd server
npm run build
cd ..

# Create necessary directories
mkdir -p server/uploads server/data
chmod 755 server/uploads server/data
```

### Step 7: Configure Nginx (Reverse Proxy)

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

---

## Configuration

### Environment Variables Reference

| Variable | Description | Default | Production Value |
|----------|-------------|---------|------------------|
| `PORT` | Server port | 3000 | 3000 (behind proxy) |
| `NODE_ENV` | Environment | development | production |
| `JWT_SECRET` | JWT signing key | - | **MUST CHANGE** |
| `CORS_ORIGIN` | Allowed origins | * | https://your-domain.com |
| `ADMIN_USERNAME` | Admin username | admin | Change immediately |
| `ADMIN_PASSWORD` | Admin password | admin123 | **CHANGE IMMEDIATELY** |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 | Adjust based on traffic |

### Generate Secure JWT Secret

```bash
openssl rand -base64 32
```

---

## Reverse Proxy Setup (Nginx)

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

## Systemd Service (Optional)

### Manage the Service

```bash
# Start service
sudo systemctl start bughouse-ladder

# Stop service
sudo systemctl stop bughouse-ladder

# Restart service
sudo systemctl restart bughouse-ladder

# View logs
sudo journalctl -u bughouse-ladder -f

# View status
sudo systemctl status bughouse-ladder
```

### Enable Auto-Start on Boot

```bash
sudo systemctl enable bughouse-ladder
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
# Test API endpoint (will fail without auth, but should connect)
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
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
sudo chmod 700 /var/www/bughouse-ladder/server/.env
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

- [ ] Changed `JWT_SECRET` to a random value
- [ ] Changed default admin credentials
- [ ] Configured SSL/TLS with Let's Encrypt
- [ ] Set `NODE_ENV=production`
- [ ] Configured CORS to only allow your domain
- [ ] Enabled firewall (UFW):
  ```bash
  sudo ufw allow 'Nginx Full'
  sudo ufw enable
  ```
- [ ] Restricted `.env` file permissions:
  ```bash
  chmod 600 /var/www/bughouse-ladder/server/.env
  ```
- [ ] Regular system updates enabled
- [ ] Log rotation configured

---

## Support

For issues or questions, please open an issue on the GitHub repository.
