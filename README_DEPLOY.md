# Deploy to your Droplet (Docker Compose)

Quick steps to prepare the Droplet (run as root or a sudoer):

1. SSH to droplet

```bash
ssh root@165.22.80.240
```

2. Update and install Docker + Docker Compose

```bash
apt update && apt upgrade -y
curl -sSL https://get.docker.com | sh
apt install -y docker-compose
usermod -aG docker $USER || true
```

3. Create app directory and pull repo

```bash
mkdir -p /srv/yourapp
cd /srv/yourapp
git clone https://github.com/<your-org>/your-repo.git .
```

4. Copy the production compose file and create `.env`

```bash
cp docker-compose.prod.yml docker-compose.yml
cp server/.env.example server/.env
# Edit server/.env with real secrets (DB passwords, JWT_SECRET, etc.)
nano server/.env
```

5. Start the stack

```bash
docker-compose pull
docker-compose up -d
```

6. Verify

```bash
docker-compose ps
docker logs -f $(docker-compose ps -q app)
curl http://localhost:${PORT:-10000}/
```

Notes
- Set GitHub Secrets (in repo Settings → Secrets):
  - `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
  - `IMAGE_NAME` (e.g. `yourdockeruser/quiz-platform:latest`)
  - `SSH_PRIVATE_KEY` (private key for deploy user)
  - `DROPLET_HOST` (165.22.80.240)
  - `DROPLET_USER` (root)
  - `REMOTE_APP_DIR` (/srv/yourapp)

- Consider using `docker volume` backups or `mysqldump` cron for DB backups.
- For SSL + domain management, run Nginx Proxy Manager or Caddy as an additional container and point your domain to the droplet IP.

Production improvements added:
- Reverse proxy: Caddy (automatic TLS) — see `caddy/Caddyfile`.
- Backups: `scripts/mysql_backup.sh` (creates timestamped dumps to `backups/`). Set up cron/systemd-timer to run nightly.
- Healthchecks: `docker-compose` healthchecks added for `app` and `db`.
- Volumes: separate volumes for Caddy config/data and DB backups.

Cron example (runs nightly at 02:00, adjust path):

```cron
0 2 * * * /srv/yourapp/scripts/mysql_backup.sh >> /var/log/mysql_backup.log 2>&1
```

To enable Caddy in `docker-compose`:

1. Edit `caddy/Caddyfile` and replace `yourdomain.com` with your domain.
2. Ensure DNS A record for yourdomain.com points to `165.22.80.240`.
3. Start or restart stack:

```bash
docker-compose up -d caddy
```

