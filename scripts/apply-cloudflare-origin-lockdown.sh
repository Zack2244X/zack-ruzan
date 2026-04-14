#!/usr/bin/env bash
set -euo pipefail

# Apply Cloudflare-only origin lockdown on a DigitalOcean host.
# Run this script ON THE DROPLET from the project root.
#
# Required/optional env vars:
#   ADMIN_IPV4=1.2.3.4         # Recommended: your current public IP for SSH allow-rule
#   ADMIN_IPV6=2001:db8::1     # Optional
#   SSH_PORT=22                # Optional
#   APP_DIR=/path/to/project   # Optional (default: current dir)
#   DRY_RUN=1                  # Optional: print commands only

SSH_PORT="${SSH_PORT:-22}"
ADMIN_IPV4="${ADMIN_IPV4:-}"
ADMIN_IPV6="${ADMIN_IPV6:-}"
APP_DIR="${APP_DIR:-$PWD}"
DRY_RUN="${DRY_RUN:-0}"
REMOVE_BROAD_RULES="${REMOVE_BROAD_RULES:-1}"

if ! command -v ufw >/dev/null 2>&1; then
  echo "[ERROR] ufw is not installed on this host." >&2
  exit 1
fi

SUDO_CMD=()
if [[ ${EUID:-0} -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO_CMD=(sudo)
  else
    echo "[ERROR] This script needs root privileges (sudo not found)." >&2
    exit 1
  fi
fi

run() {
  echo "+ $*"
  if [[ "$DRY_RUN" != "1" ]]; then
    "$@"
  fi
}

if [[ -z "$ADMIN_IPV4" ]]; then
  ADMIN_IPV4="$(curl -4 -fsSL https://api.ipify.org || true)"
fi

if [[ -z "$ADMIN_IPV4" ]]; then
  echo "[ERROR] Could not auto-detect ADMIN_IPV4. Set it explicitly." >&2
  echo "Example: ADMIN_IPV4=1.2.3.4 $0" >&2
  exit 1
fi

echo "[INFO] Using ADMIN_IPV4=$ADMIN_IPV4, SSH_PORT=$SSH_PORT"

mapfile -t CF_IPV4 < <(curl -fsSL https://www.cloudflare.com/ips-v4 | sed '/^\s*$/d')
mapfile -t CF_IPV6 < <(curl -fsSL https://www.cloudflare.com/ips-v6 | sed '/^\s*$/d')

if [[ ${#CF_IPV4[@]} -eq 0 ]]; then
  echo "[ERROR] Failed to fetch Cloudflare IPv4 ranges." >&2
  exit 1
fi

timestamp="$(date +%s)"
if [[ -f /lib/ufw/user.rules ]]; then
  run "${SUDO_CMD[@]}" cp /lib/ufw/user.rules "/lib/ufw/user.rules.bak.$timestamp"
fi
if [[ -f /lib/ufw/user6.rules ]]; then
  run "${SUDO_CMD[@]}" cp /lib/ufw/user6.rules "/lib/ufw/user6.rules.bak.$timestamp"
fi

# 1) Keep SSH access open first.
run "${SUDO_CMD[@]}" ufw allow from "$ADMIN_IPV4" to any port "$SSH_PORT" proto tcp
if [[ -n "$ADMIN_IPV6" ]]; then
  run "${SUDO_CMD[@]}" ufw allow from "$ADMIN_IPV6" to any port "$SSH_PORT" proto tcp
fi

# 2) Allow Cloudflare edge ranges to hit 80/443.
for ip in "${CF_IPV4[@]}"; do
  run "${SUDO_CMD[@]}" ufw allow from "$ip" to any port 80 proto tcp
  run "${SUDO_CMD[@]}" ufw allow from "$ip" to any port 443 proto tcp
done

for ip in "${CF_IPV6[@]}"; do
  run "${SUDO_CMD[@]}" ufw allow from "$ip" to any port 80 proto tcp
  run "${SUDO_CMD[@]}" ufw allow from "$ip" to any port 443 proto tcp
done

# 3) Remove legacy broad ALLOW rules for 80/443 (if present), then deny globally.
if [[ "$REMOVE_BROAD_RULES" == "1" ]]; then
  mapfile -t DELETE_RULES < <(
    "${SUDO_CMD[@]}" ufw status numbered \
      | awk '/ALLOW IN/ && /Anywhere/ && /(80\/tcp|443\/tcp)/ {gsub(/[\[\]]/, "", $1); print $1}' \
      | sort -rn
  )

  for rule_num in "${DELETE_RULES[@]:-}"; do
    [[ -z "$rule_num" ]] && continue
    run "${SUDO_CMD[@]}" ufw --force delete "$rule_num"
  done
fi

run "${SUDO_CMD[@]}" ufw deny 80/tcp
run "${SUDO_CMD[@]}" ufw deny 443/tcp
run "${SUDO_CMD[@]}" ufw --force enable
run "${SUDO_CMD[@]}" ufw status numbered

# 4) Recreate nginx container if this looks like the app repo.
if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    run "${SUDO_CMD[@]}" bash -lc "cd '$APP_DIR' && docker compose up -d --force-recreate nginx"
  elif command -v docker-compose >/dev/null 2>&1; then
    run "${SUDO_CMD[@]}" bash -lc "cd '$APP_DIR' && docker-compose up -d --force-recreate nginx"
  else
    echo "[WARN] docker compose not found; skipping nginx recreate." >&2
  fi
else
  echo "[WARN] docker-compose.yml not found in APP_DIR=$APP_DIR; skipping nginx recreate." >&2
fi

echo
echo "[DONE] Cloudflare origin lockdown applied."
echo "[NEXT] Validate from your local machine:"
echo "       - domain works:   curl -I https://zackpro.codes"
echo "       - direct origin blocked (example):"
echo "         curl -k -I --resolve zackpro.codes:443:46.101.209.56 https://zackpro.codes"
