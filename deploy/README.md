# Internal Deployment Notes

## Architecture

```
Browser → your-domain.com/my-project/dist/ → my-project.your-domain.com (HTTPS) → Nginx → localhost:3000
```

The frontend is served from `your-domain.com/<project-name>/dist/`. The subdomain `<project-name>.your-domain.com` is always the same as the project directory name. When the client needs API data, it calls `https://<project-name>.your-domain.com/api/...`, which Nginx proxies to the backend.

## Naming Convention

**SUBDOMAIN == PROJECT_NAME** — The subdomain always matches the project directory name:

- Directory: `/var/www/html/my-project` → Subdomain: `my-project.your-domain.com`
- Directory: `/var/www/html/rel-ladder` → Subdomain: `rel-ladder.your-domain.com`

This convention is enforced by `manage_versions.sh` which derives the project name from `basename "$(pwd)"`.

## Deployment Workflow

### 1. Clone and name the directory

```bash
sudo mkdir -p /var/www/html
cd /var/www/html
git clone <repo-url> my-project
cd my-project
```

The directory name becomes the project name, subdomain, and systemd service name.

**Naming rules:** Only letters, numbers, and hyphens (`-`). No underscores (`_`), spaces, or dots. Examples: `my-project`, `rel-ladder`, `test-ladder`.

### 2. Configure server/.env

```bash
cd server
cp .env.example .env
nano .env
```

Set at minimum:
- `PORT=<port>` — backend port
- `DOMAIN=your-domain.com` — public domain
- `ADMIN_API_KEY=<key>` — admin access key (required in production)
- `USER_API_KEY=<key>` — user write key (required in production)

Both `ADMIN_API_KEY` and `USER_API_KEY` are required in production. The server will refuse to start if either is missing.

> Production keys should live in a protected file, not `server/.env`. See [API Key Management](#api-key-management).

### 3. Create the instance (nginx + systemd)

```bash
cd /var/www/html/my-project
sudo ./deploy/manage_versions.sh add
```

Requires root — checks that you're running as sudo and that `server/.env` contains `PORT`, `DOMAIN`, `ADMIN_API_KEY`, and `USER_API_KEY` (all required in production).

This creates:
- Nginx config at `/etc/nginx/sites-available/my-project.your-domain.com.conf`
- Systemd service at `/etc/systemd/system/my-project.service`
- Starts the service automatically

### 4. Provision SSL

```bash
sudo certbot --nginx -d my-project.your-domain.com
```

### 5. Build and deploy

```bash
cd /var/www/html/my-project
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
cd /var/www/html/my-project
git pull          # or make your changes
sudo ./deploy/update.sh
```

## Removing an Instance

```bash
cd /var/www/html/my-project
sudo ./deploy/manage_versions.sh remove
```

This stops the service, removes nginx config, and deletes the instance directory.

## API Key Management

Keys are read from the protected file first, then legacy `server/.env` as a migration fallback.

| File | Contents | Permissions |
|------|----------|-------------|
| `<instance>/server/.env` | Non-secret config: `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `DOMAIN`, `TAB_FILE_PATH` | `0640` |
| `/etc/bughouse-ladder/<instance>.env` | Secrets only: `ADMIN_API_KEY`, `USER_API_KEY` | `0640 root:bughouse-ladder` or `0600 root:root` |

Systemd loads both via `EnvironmentFile`; the service user never needs read access to the secret file.

### Migrate an instance (one-time)

```bash
cd /var/www/html/<instance>
sudo bash ./deploy/secure-env.sh <admin-user>
```

Moves the keys to `/etc/bughouse-ladder/<instance>.env`, removes them from `server/.env`, backs it up (mode `0600`), wires both `EnvironmentFile` lines, and restarts the service. Add the admin user to the `bughouse-ladder` group — re-login afterwards.

Migrate **every** instance before rotating keys.

### Rotate keys (all instances)

```bash
cd /var/www/html/<instance>
./deploy/rotate-key-all.sh
```

Keys come from hidden prompts or `ROTATE_ADMIN_KEY`/`ROTATE_USER_KEY` environment variables (never CLI arguments). Generated keys and config URLs go to a mode-`0600` report under `$HOME` — copy them to the password manager, then delete the report. Regenerate browser shortcuts (`create_html.sh`) and refresh PWA keys afterwards.

### Browser shortcuts

```bash
cd /var/www/html/<instance>
sudo ./deploy/create_html.sh    # writes ~/ladder-bookmarks-<date>.html, mode 0600
```

Download, import into the browser, then `shred -u` the file on the server and locally. Regenerate after every rotation.

Shortcut URLs send `?key=...` in the request, which nginx records in `access.log` by default. Fix once for all apps on the server:

```bash
sudo bash ./deploy/fix-dist-nolog.sh --dry-run   # review diff
sudo bash ./deploy/fix-dist-nolog.sh             # insert access_log off into all /dist/ locations, nginx -t + reload
sudo bash ./deploy/fix-dist-nolog.sh --test --purge-logs   # prove fix, erase logged keys
```

Covers every parent domain found in `/etc/nginx/sites-available` (all ladder instances and other apps). Vhosts without a dedicated `/dist/` location are reported for a manual one-line addition (`deploy/nginx/dist-nolog.conf`). `verify.sh` section 19 warns while `?key=` entries exist in readable logs.

The nginx-served `/dist/` frontend gets no CSP from the Node app — add `deploy/nginx/csp.conf` (CSP + `nosniff`/`frame-ancestors` headers) to the parent vhost as well.

### Local development keys (Windows)

```powershell
.\deploy\update-env-key.ps1     # hidden prompt, updates gitignored .env files only
```

Never hardcode keys in `.bat`/`.ps1` scripts, tests, or docs.

### Helpers

`deploy/ladder-env.sh` provides the shared functions (`ladder_read_env_value`, `ladder_has_env_value`, `ladder_write_secret_file`, `ladder_ensure_environment_file`, ...) used by `update.sh`, `verify.sh`, `admin-urls.sh`, `create_html.sh`, `manage_versions.sh`, `secure-env.sh`, and `rotate-key-all.sh`. Override the location with `LADDER_SECRET_DIR` / `LADDER_SECRET_GROUP`.

## Example URLs

| Project  | Subdomain              | Config URL |
|----------|------------------------|------------|
| my-project | my-project.your-domain.com | https://your-domain.com/my-project/dist/?config=1&server=https://my-project.your-domain.com&key=mykey |
| rel-ladder | rel-ladder.your-domain.com | https://your-domain.com/rel-ladder/dist/?config=1&server=https://rel-ladder.your-domain.com&key=mykey |

## Frontend Config Strings

**Development:**
```
https://your-domain.com/my-project/dist/?config=1&server=https://my-project.your-domain.com&key=mykey
```

**Release:**
```
https://your-domain.com/rel-ladder/dist/?config=1&server=https://rel-ladder.your-domain.com&key=mykey
```

Enter the API key in Settings > Server Connection.

## Nginx Configs

### my-project.your-domain.com

```
server {
    listen 80;
    server_name my-project.your-domain.com;

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
- `my-project.your-domain.com` → your server IP
- `rel-ladder.your-domain.com` → your server IP

## Systemd Service Files

`manage_versions.sh add` generates these automatically. No manual file creation needed.

If `EnvironmentFile` is missing from a deployed service file, `update.sh` [9/10] injects it automatically before restarting — for both `server/.env` and the protected `/etc/bughouse-ladder/<instance>.env` (when present). This is required for the server to load API keys.

### my-project.service

```ini
[Unit]
Description=Bughouse Chess Ladder - my-project
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/html/my-project/instances/my-project
Environment=NODE_ENV=production
EnvironmentFile=/var/www/html/my-project/server/.env
EnvironmentFile=-/etc/bughouse-ladder/my-project.env
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
EnvironmentFile=/var/www/html/rel-ladder/server/.env
EnvironmentFile=-/etc/bughouse-ladder/rel-ladder.env
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
# Live logs for my-project
sudo journalctl -u my-project -f

# Live logs for rel-ladder
sudo journalctl -u rel-ladder -f
```
