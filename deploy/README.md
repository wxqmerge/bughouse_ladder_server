# Internal Deployment Notes

## Architecture

```
Browser → your-domain.com/dev-ladder/dist/ → dev-ladder.your-domain.com (HTTPS) → Nginx → localhost:3000
```

The frontend is served from `your-domain.com/<project-name>/dist/`. The subdomain `<project-name>.your-domain.com` is always the same as the project directory name. When the client needs API data, it calls `https://<project-name>.your-domain.com/api/...`, which Nginx proxies to the backend.

## Naming Convention

**SUBDOMAIN == PROJECT_NAME** — The subdomain always matches the project directory name:

- Directory: `/var/www/html/dev-ladder` → Subdomain: `dev-ladder.your-domain.com`
- Directory: `/var/www/html/rel-ladder` → Subdomain: `rel-ladder.your-domain.com`

This convention is enforced by `manage_versions.sh` which derives the project name from `basename "$(pwd)"`.

## Deployment Workflow

### 1. Clone and name the directory

```bash
sudo mkdir -p /var/www/html
cd /var/www/html
git clone <repo-url> dev-ladder
cd dev-ladder
```

The directory name becomes the project name, subdomain, and systemd service name.

### 2. Configure server/.env

```bash
cd server
cp .env.example .env
nano .env
```

Set at minimum:
- `PORT=<port>` — backend port
- `DOMAIN=your-domain.com` — public domain
- `ADMIN_API_KEY=<key>` — admin access key
- `USER_API_KEY=<key>` — user write key

### 3. Create the instance (nginx + systemd)

```bash
cd /var/www/html/dev-ladder
sudo ./deploy/manage_versions.sh add
```

Requires root — checks that you're running as sudo and that `server/.env` contains `PORT`, `DOMAIN`, `ADMIN_API_KEY`, and `USER_API_KEY`.

This creates:
- Nginx config at `/etc/nginx/sites-available/dev-ladder.your-domain.com.conf`
- Systemd service at `/etc/systemd/system/dev-ladder.service`
- Starts the service automatically

### 4. Provision SSL

```bash
sudo certbot --nginx -d dev-ladder.your-domain.com
```

### 5. Build and deploy

```bash
cd /var/www/html/dev-ladder
sudo ./deploy/update.sh
```

This installs dependencies, builds frontend + server, and restarts the service.

### 6. Verify and get config strings

```bash
./deploy/verify.sh
```

Output shows health checks and client config strings for admin/user/view access.

## Updating an Existing Instance

```bash
cd /var/www/html/dev-ladder
git pull          # or make your changes
sudo ./deploy/update.sh
```

## Removing an Instance

```bash
cd /var/www/html/dev-ladder
sudo ./deploy/manage_versions.sh remove
```

This stops the service, removes nginx config, and deletes the instance directory.

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

## DNS

Ensure A records exist for:
- `dev-ladder.your-domain.com` → your server IP
- `rel-ladder.your-domain.com` → your server IP

## Systemd Service Files

`manage_versions.sh add` generates these automatically. No manual file creation needed.

### dev-ladder.service

```ini
[Unit]
Description=Bughouse Chess Ladder - dev-ladder
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/html/dev-ladder/instances/dev-ladder
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
Description=Bughouse Chess Ladder - rel-ladder
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/html/rel-ladder/instances/rel-ladder
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

### Tracing Logs

```bash
# Live logs for dev-ladder
sudo journalctl -u dev-ladder -f

# Live logs for rel-ladder
sudo journalctl -u rel-ladder -f
```
