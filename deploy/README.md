# Internal Deployment Notes

## Architecture

```
Browser → omen.com/dev/dist/ → dev.omen.com (HTTPS) → Nginx → localhost:3000
```

The frontend is served from `omen.com/dev/dist/`. When it needs API data, it calls `https://dev.omen.com/api/...`, which Nginx proxies to the backend on port 3000.

## Quick Setup

The script automatically uses your machine's hostname. Run `hostname` to see what it will use.

### Add a new version

```bash
sudo ./deploy/manage_versions.sh add dev-ladder 3000
sudo ./deploy/manage_versions.sh add rel-ladder 3001
```

### Start a backend

```bash
cd deploy/instances/dev-ladder && PORT=3000 node dist/index.js
cd deploy/instances/rel-ladder && PORT=3001 node dist/index.js
```

### Remove a version

```bash
sudo ./deploy/manage_versions.sh remove dev-ladder
```

## Example URLs

| Ladder  | Subdomain     | Port | API Key |
|---------|---------------|------|---------|
| dev     | dev.omen.com  | 3000 | mykey   |
| rel     | rel.omen.com  | 3001 | mykey   |

## Frontend Config Strings

**Development:**
```
http://omen.com/dev/dist/?config=1&server=https://dev.omen.com&key=mykey
```

**Release:**
```
http://omen.com/rel/dist/?config=1&server=https://rel.omen.com&key=mykey
```

Enter the API key in Settings > Server Connection.

## Nginx Configs

### dev.omen.com

```
server {
    listen 80;
    server_name dev.omen.com;

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

### rel.omen.com

```
server {
    listen 80;
    server_name rel.omen.com;

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

## Deploying Nginx

Copy the config files to your server and enable them:

```bash
# Copy configs to Nginx
sudo cp deploy/nginx/dev.omen.com.conf /etc/nginx/sites-available/dev.omen.com.conf
sudo cp deploy/nginx/rel.omen.com.conf /etc/nginx/sites-available/rel.omen.com.conf

# Enable them (symlink)
sudo ln -s /etc/nginx/sites-available/dev.omen.com.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/rel.omen.com.conf /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

## DNS

Ensure A records exist for:
- `dev.omen.com` → your server IP
- `rel.omen.com` → your server IP

## SSL

```bash
sudo certbot --nginx -d dev.omen.com
sudo certbot --nginx -d rel.omen.com
```

## Systemd Service Files

Each ladder version needs a systemd service file to run as a background service.

### dev-ladder.service

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

### rel-ladder.service

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
# Copy service files
sudo cp deploy/instances/dev-ladder/dev-ladder.service /etc/systemd/system/
sudo cp deploy/instances/rel-ladder/rel-ladder.service /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable dev-ladder rel-ladder
sudo systemctl start dev-ladder rel-ladder

# Verify
sudo systemctl status dev-ladder rel-ladder
```

### Tracing Logs

```bash
# Live logs for dev-ladder
sudo journalctl -u dev-ladder -f

# Live logs for rel-ladder
sudo journalctl -u rel-ladder -f
```
