#!/usr/bin/env bash
set -euo pipefail

TOKEN_FILE=${1:-/root/.digitalocean_token}
if [ ! -f "$TOKEN_FILE" ]; then
  echo "Token file $TOKEN_FILE not found; create it with your DigitalOcean token." >&2
  exit 1
fi
TOKEN=$(cat "$TOKEN_FILE")

cd "$(dirname "$0")"

echo "Building Caddy image with DigitalOcean DNS plugin..."
docker build -t caddy-digitalocean:local .

echo "Preparing Caddyfile at /tmp/Caddyfile (read-only mount into container)..."
cp Caddyfile.example /tmp/Caddyfile

echo "Stopping old caddy container (if any) and starting new one..."
docker rm -f caddy || true
docker run -d --name caddy \
  --restart unless-stopped \
  --network host \
  -v /tmp/Caddyfile:/etc/caddy/Caddyfile:ro \
  -e DIGITALOCEAN_TOKEN="$TOKEN" \
  caddy-digitalocean:local

echo "Tailing caddy logs (press Ctrl-C to stop)..."
docker logs -f caddy
