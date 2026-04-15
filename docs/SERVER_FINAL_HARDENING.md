# Server Final Hardening (Direct Execution)

Run this on the production server from project root:

```bash
chmod +x ./scripts/apply-final-security-hardening.sh
APP_DIR=$PWD \
DOMAIN=zackpro.codes \
APPLY_ORIGIN_LOCKDOWN=1 \
CF_API_TOKEN=<YOUR_CF_API_TOKEN> \
CF_ZONE_ID=<YOUR_CF_ZONE_ID> \
./scripts/apply-final-security-hardening.sh
```

## What this script does
- Forces production security env values in `.env` and `server/.env`.
- Ensures Redis-backed DDoS/rate-limit backend is configured.
- Builds/restarts `redis`, `db`, `app`, `nginx` with Docker Compose.
- Validates local app and nginx health checks.
- Optionally applies origin lockdown firewall rules (Cloudflare-only 80/443).
- Applies Cloudflare WAF + rate limit rules idempotently.

## Optional flags
- `APPLY_ORIGIN_LOCKDOWN=0` to skip UFW origin locking.
- `FORCE_ORIGIN_LOCKDOWN=1` to apply even if Cloudflare NS auto-check fails.
- `APPLY_CLOUDFLARE_WAF=0` to skip WAF API apply.
- `ADMIN_IPV4=<YOUR_IP>` and `SSH_PORT=<PORT>` for precise SSH allow rules.

## Safety notes
- Origin lockdown modifies UFW rules. Ensure SSH access variables are correct.
- Keep Cloudflare DNS proxy enabled before enforcing origin lockdown.
- Re-run the script safely; WAF/rate-limit rules are merged by description.
