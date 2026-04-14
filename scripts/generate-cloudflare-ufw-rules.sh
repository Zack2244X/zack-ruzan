#!/usr/bin/env bash
set -euo pipefail

# Generates reviewed UFW commands to lock origin ports (80/443) to Cloudflare only.
# Usage:
#   ADMIN_IPV4=1.2.3.4 ADMIN_IPV6=2001:db8::1 SSH_PORT=22 ./scripts/generate-cloudflare-ufw-rules.sh

SSH_PORT="${SSH_PORT:-22}"
ADMIN_IPV4="${ADMIN_IPV4:-}"
ADMIN_IPV6="${ADMIN_IPV6:-}"

if [[ -z "$ADMIN_IPV4" ]]; then
  ADMIN_IPV4="$(curl -4 -fsSL https://api.ipify.org || true)"
fi

mapfile -t CF_IPV4 < <(curl -fsSL https://www.cloudflare.com/ips-v4 | sed '/^\s*$/d')
mapfile -t CF_IPV6 < <(curl -fsSL https://www.cloudflare.com/ips-v6 | sed '/^\s*$/d')

echo "# 1) Backup current firewall rules"
echo "sudo ufw status verbose"
echo "sudo cp /lib/ufw/user.rules /lib/ufw/user.rules.bak.$(date +%s) 2>/dev/null || true"
echo "sudo cp /lib/ufw/user6.rules /lib/ufw/user6.rules.bak.$(date +%s) 2>/dev/null || true"
echo

echo "# 2) Keep SSH access open first (important)"
if [[ -n "$ADMIN_IPV4" ]]; then
  echo "sudo ufw allow from $ADMIN_IPV4 to any port $SSH_PORT proto tcp"
else
  echo "sudo ufw allow $SSH_PORT/tcp"
fi
if [[ -n "$ADMIN_IPV6" ]]; then
  echo "sudo ufw allow from $ADMIN_IPV6 to any port $SSH_PORT proto tcp"
fi
echo

echo "# 3) Allow Cloudflare edge to reach origin on 80/443"
for ip in "${CF_IPV4[@]}"; do
  echo "sudo ufw allow from $ip to any port 80 proto tcp"
  echo "sudo ufw allow from $ip to any port 443 proto tcp"
done
for ip in "${CF_IPV6[@]}"; do
  echo "sudo ufw allow from $ip to any port 80 proto tcp"
  echo "sudo ufw allow from $ip to any port 443 proto tcp"
done
echo

echo "# 4) Deny all non-Cloudflare traffic to 80/443"
echo "sudo ufw deny 80/tcp"
echo "sudo ufw deny 443/tcp"
echo

echo "# 5) Enable firewall and verify"
echo "sudo ufw --force enable"
echo "sudo ufw status numbered"

echo
cat <<'NOTE'
# IMPORTANT:
# - Run commands on the DigitalOcean droplet (not locally).
# - If you still have broad rules like '80/tcp ALLOW Anywhere', delete them after adding CF allows:
#     sudo ufw status numbered
#     sudo ufw delete <rule-number>
# - When Cloudflare updates ranges, regenerate and sync rules again.
NOTE
