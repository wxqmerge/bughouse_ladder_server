# Internal Deployment Notes

## Architecture

```
Browser → your-domain.com/dev-ladder/dist/ → dev-ladder.your-domain.com (HTTPS) → Nginx → localhost:3000
```

The frontend is served from `your-domain.com/<project-name>/dist/`. The subdomain `<project-name>.your-domain.com` is always the same as the project directory name. When the client needs API data, it calls `https://<project-name>.your-domain.com/api/...`, which Nginx proxies to the backend.

## Quick Setup

The script automatically derives the project name from the current directory. Run `basename "$(pwd)"` to see what it will use.

### Add a new version

```bash
cd /var/www/html/dev-ladder
sudo ./deploy/manage_versions.sh add
```

### Start a backend

```bash
sudo systemctl start dev-ladder
```

### Remove a version

```bash
cd /var/www/html/dev-ladder
sudo ./deploy/manage_versions.sh remove
```

## Example URLs

| Project  | Subdomain              | Config URL |
|----------|------------------------|------------|
| dev-ladder | dev-ladder.your-domain.com | https://your-domain.com/dev-ladder/dist/?config=1&server=https://dev-ladder.your-domain.com&key=mykey |
| rel-ladder | rel-ladder.your-domain.com | https://your-domain.com/rel-ladder/dist/?config=1&server=https://rel-ladder.your-domain.com&key=mykey |

## Frontend Config Strings

**Development:**
```
https://your-domain.com/dev-ladder/dist/?config=1&server=https://dev-ladder.your-domain.com&key=mykey
```

**Release:**
```
https://your-domain.com/rel-ladder/dist/?config=1&server=https://rel-ladder.your-domain.com&key=mykey
```

Enter the API key in Settings > Server Connection.

## Naming Convention

**SUBDOMAIN == PROJECT_NAME** — The subdomain always matches the project directory name:

- Directory: `/var/www/html/dev-ladder` → Subdomain: `dev-ladder.your-domain.com`
- Directory: `/var/www/html/rel-ladder` → Subdomain: `rel-ladder.your-domain.com`

This convention is enforced by `manage_versions.sh` which derives the project name from `basename "$(pwd)"`.

## Nginx Configs

### dev-ladder.your-domain.com

```
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

### rel-ladder.your-domain.com

```
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

## Deploying Nginx

Copy the config files to your server and enable them:

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

## DNS

Ensure A records exist for:
- `dev-ladder.your-domain.com` → your server IP
- `rel-ladder.your-domain.com` → your server IP

## SSL

```bash
sudo certbot --nginx -d dev-ladder.your-domain.com
sudo certbot --nginx -d rel-ladder.your-domain.com
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
