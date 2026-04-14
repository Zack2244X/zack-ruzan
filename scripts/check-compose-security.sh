#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="${1:-docker-compose.yml}"

if [[ ! -f "$TARGET_FILE" ]]; then
  echo "[compose-policy] File not found: $TARGET_FILE" >&2
  exit 1
fi

in_services=0
in_app=0

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="${raw_line%%#*}"

  if [[ "$line" =~ ^services:[[:space:]]*$ ]]; then
    in_services=1
    in_app=0
    continue
  fi

  if [[ "$in_services" -eq 0 ]]; then
    continue
  fi

  if [[ "$line" =~ ^[[:space:]]{2}app:[[:space:]]*$ ]]; then
    in_app=1
    continue
  fi

  if [[ "$in_app" -eq 1 && "$line" =~ ^[[:space:]]{2}[A-Za-z0-9_-]+:[[:space:]]*$ && ! "$line" =~ ^[[:space:]]{2}app:[[:space:]]*$ ]]; then
    in_app=0
  fi

  if [[ "$in_app" -eq 1 && "$line" =~ ^[[:space:]]{4}ports:[[:space:]]*$ ]]; then
    echo "[compose-policy] Forbidden: services.app.ports detected in $TARGET_FILE" >&2
    exit 1
  fi
done < "$TARGET_FILE"

if grep -Eq '^[[:space:]]*-[[:space:]]*"?(0\.0\.0\.0:|::)?3000:3000"?[[:space:]]*$' "$TARGET_FILE"; then
  echo "[compose-policy] Forbidden host mapping found for 3000:3000 in $TARGET_FILE" >&2
  exit 1
fi

echo "[compose-policy] PASS: app service is not host-published on 3000 in $TARGET_FILE"
