# Cloudflare Origin Lockdown (DigitalOcean)

## What this secures
- All visitor traffic must pass through Cloudflare first.
- Direct hits to the droplet IP on 80/443 are blocked.
- Nginx trusts Cloudflare's `CF-Connecting-IP` and restores the real client IP.

## What is already done in this repo
1. Nginx now trusts Cloudflare edge ranges and restores real IP.
2. Origin-lockdown logic exists but is **disabled by default** to avoid conflicts before Cloudflare proxy is active.
3. You can enable origin-lockdown with one config value after Cloudflare DNS proxying is confirmed.

Changed files:
- [nginx/nginx.conf](nginx/nginx.conf)
- [nginx/nginx-simple.conf](nginx/nginx-simple.conf)

## What you still need to do on the droplet
### Fast path (recommended: one command)
1. SSH to the droplet and run from project root:
   - `chmod +x ./scripts/apply-cloudflare-origin-lockdown.sh`
   - `ADMIN_IPV4=<YOUR_PUBLIC_IP> ./scripts/apply-cloudflare-origin-lockdown.sh`
2. Validate from your local machine:
   - `curl -I https://zackpro.codes`
   - `curl -k -I --resolve zackpro.codes:443:46.101.209.56 https://zackpro.codes`

If needed, use dry-run first:
- `ADMIN_IPV4=<YOUR_PUBLIC_IP> DRY_RUN=1 ./scripts/apply-cloudflare-origin-lockdown.sh`

### Manual path (detailed)
1. SSH into the DigitalOcean droplet.
2. Generate UFW commands from this repo:
   - `chmod +x ./scripts/generate-cloudflare-ufw-rules.sh`
   - `ADMIN_IPV4=<YOUR_PUBLIC_IP> ./scripts/generate-cloudflare-ufw-rules.sh`
3. Copy generated commands and run them on the droplet.
4. Remove any broad rules that still allow `80/tcp` or `443/tcp` from anywhere.
5. Verify:
   - Direct `http://<DROPLET_IP>` should be blocked.
   - `https://your-domain` should work normally through Cloudflare.

## Enabling origin-lockdown safely (after Cloudflare is active)
1. Confirm domain is really behind Cloudflare:
   - `dig NS your-domain +short` should return Cloudflare nameservers.
   - `dig A your-domain +short` should return Cloudflare edge IPs (not droplet origin IP).
2. Edit [nginx/nginx.conf](nginx/nginx.conf):
   - In `map $host $origin_lockdown`, change `zackpro.codes 0;` to `zackpro.codes 1;`
3. If using simple config, do the same in [nginx/nginx-simple.conf](nginx/nginx-simple.conf).
4. Reload nginx:
   - `docker compose up -d --force-recreate nginx`
5. Re-verify:
   - direct origin IP should fail (403/blocked)
   - domain through Cloudflare should remain available

## Cloudflare dashboard checks
1. DNS records for the site are **Proxied** (orange cloud).
2. SSL/TLS mode is **Full (strict)**.
3. WAF managed rules are enabled.
4. Optional during attacks: enable **Under Attack Mode** temporarily.

## Operational note
Cloudflare IP ranges can change. Re-run the generator script and sync UFW rules periodically.
