#!/usr/bin/env bash
set -euo pipefail

# Final production hardening bootstrap for DigitalOcean + Cloudflare.
# Run ON THE SERVER from project root:
#   chmod +x ./scripts/apply-final-security-hardening.sh
#   APP_DIR=$PWD DOMAIN=zackpro.codes APPLY_ORIGIN_LOCKDOWN=1 CF_API_TOKEN=... CF_ZONE_ID=... ./scripts/apply-final-security-hardening.sh

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
DOMAIN="${DOMAIN:-zackpro.codes}"
APPLY_ORIGIN_LOCKDOWN="${APPLY_ORIGIN_LOCKDOWN:-0}"
FORCE_ORIGIN_LOCKDOWN="${FORCE_ORIGIN_LOCKDOWN:-0}"
APPLY_CLOUDFLARE_WAF="${APPLY_CLOUDFLARE_WAF:-1}"
REDIS_URL_VALUE="${REDIS_URL:-redis://redis:6379}"
DDOS_FAIL_CLOSED_VALUE="${DDOS_FAIL_CLOSED:-true}"
ENABLE_ADVANCED_DDOS_PROTECTION_VALUE="${ENABLE_ADVANCED_DDOS_PROTECTION:-true}"
HEALTHCHECK_TOKEN_VALUE="${HEALTHCHECK_TOKEN:-}"

ROOT_ENV_FILE="$APP_DIR/.env"
SERVER_ENV_FILE="$APP_DIR/server/.env"
ROOT_ENV_EXAMPLE="$APP_DIR/.env.example"
SERVER_ENV_EXAMPLE="$APP_DIR/server/.env.example"

log_info() {
  echo "[INFO] $*"
}

log_warn() {
  echo "[WARN] $*" >&2
}

log_error() {
  echo "[ERROR] $*" >&2
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "Missing required command: $cmd"
    exit 1
  fi
}

select_compose_command() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return
  fi
  log_error "Neither 'docker compose' nor 'docker-compose' is available."
  exit 1
}

generate_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48
}

ensure_env_file() {
  local file="$1"
  local example="$2"
  if [[ -f "$file" ]]; then
    return
  fi
  if [[ -f "$example" ]]; then
    cp "$example" "$file"
    log_info "Created $file from example."
    return
  fi
  touch "$file"
  log_warn "Created empty env file: $file"
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ ! -f "$file" ]]; then
    touch "$file"
  fi

  local temp_file
  temp_file="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { replaced = 0 }
    {
      if ($0 ~ ("^" k "=")) {
        print k "=" v
        replaced = 1
      } else {
        print $0
      }
    }
    END {
      if (!replaced) {
        print k "=" v
      }
    }
  ' "$file" >"$temp_file"
  mv "$temp_file" "$file"
}

domain_uses_cloudflare() {
  local domain="$1"
  if ! command -v dig >/dev/null 2>&1; then
    log_warn "dig not found; cannot verify Cloudflare NS automatically."
    return 1
  fi

  local ns_output
  ns_output="$(dig +short NS "$domain" | tr '[:upper:]' '[:lower:]')"
  if grep -q "cloudflare" <<<"$ns_output"; then
    return 0
  fi
  return 1
}

run_local_health_checks() {
  local compose_cmd="$1"

  log_info "Running app health check from app container..."
  eval "$compose_cmd exec -T app node -e \"const http=require('http'); const req=http.get('http://localhost:3000/api/health',res=>{const ok=(res.statusCode===200||res.statusCode===503); process.exit(ok?0:1)}); req.on('error',()=>process.exit(1));\""

  log_info "Running nginx local health check..."
  eval "$compose_cmd exec -T nginx wget --quiet --tries=1 --spider http://localhost/healthz"

  log_info "Checking public health endpoint expectation (should not be 200)..."
  local health_code
  health_code="$(curl -k -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/healthz" || true)"
  if [[ "$health_code" == "200" ]]; then
    log_warn "Public /healthz returned 200. Re-check edge/proxy path and Cloudflare rules."
  else
    log_info "Public /healthz returned $health_code (expected non-200)."
  fi
}

main() {
  require_cmd curl
  require_cmd awk
  require_cmd sed
  require_cmd bash

  local compose_cmd
  compose_cmd="$(select_compose_command)"

  log_info "Project directory: $APP_DIR"
  log_info "Using compose command: $compose_cmd"

  ensure_env_file "$ROOT_ENV_FILE" "$ROOT_ENV_EXAMPLE"
  ensure_env_file "$SERVER_ENV_FILE" "$SERVER_ENV_EXAMPLE"

  if [[ -z "$HEALTHCHECK_TOKEN_VALUE" ]]; then
    HEALTHCHECK_TOKEN_VALUE="$(generate_token)"
    log_info "Generated HEALTHCHECK_TOKEN automatically."
  fi

  log_info "Updating environment files for production hardening..."
  upsert_env_var "$SERVER_ENV_FILE" "NODE_ENV" "production"
  upsert_env_var "$SERVER_ENV_FILE" "REDIS_URL" "$REDIS_URL_VALUE"
  upsert_env_var "$SERVER_ENV_FILE" "DDOS_FAIL_CLOSED" "$DDOS_FAIL_CLOSED_VALUE"
  upsert_env_var "$SERVER_ENV_FILE" "ENABLE_ADVANCED_DDOS_PROTECTION" "$ENABLE_ADVANCED_DDOS_PROTECTION_VALUE"
  upsert_env_var "$SERVER_ENV_FILE" "HEALTHCHECK_TOKEN" "$HEALTHCHECK_TOKEN_VALUE"

  upsert_env_var "$ROOT_ENV_FILE" "NODE_ENV" "production"
  upsert_env_var "$ROOT_ENV_FILE" "REDIS_URL" "$REDIS_URL_VALUE"
  upsert_env_var "$ROOT_ENV_FILE" "DDOS_FAIL_CLOSED" "$DDOS_FAIL_CLOSED_VALUE"
  upsert_env_var "$ROOT_ENV_FILE" "ENABLE_ADVANCED_DDOS_PROTECTION" "$ENABLE_ADVANCED_DDOS_PROTECTION_VALUE"
  upsert_env_var "$ROOT_ENV_FILE" "HEALTHCHECK_TOKEN" "$HEALTHCHECK_TOKEN_VALUE"

  log_info "Starting/recreating hardened stack (redis + db + app + nginx)..."
  eval "cd '$APP_DIR' && $compose_cmd up -d --build redis db app nginx"

  run_local_health_checks "$compose_cmd"

  if [[ "$APPLY_ORIGIN_LOCKDOWN" == "1" ]]; then
    if [[ "$FORCE_ORIGIN_LOCKDOWN" != "1" ]]; then
      if domain_uses_cloudflare "$DOMAIN"; then
        log_info "Cloudflare NS detected for $DOMAIN. Applying origin lockdown..."
      else
        log_warn "Cloudflare NS not detected for $DOMAIN; skipping origin lockdown. Set FORCE_ORIGIN_LOCKDOWN=1 to override."
      fi
    fi

    if [[ "$FORCE_ORIGIN_LOCKDOWN" == "1" ]] || domain_uses_cloudflare "$DOMAIN"; then
      ADMIN_IPV4="${ADMIN_IPV4:-}" ADMIN_IPV6="${ADMIN_IPV6:-}" SSH_PORT="${SSH_PORT:-22}" APP_DIR="$APP_DIR" \
        "$SCRIPT_DIR/apply-cloudflare-origin-lockdown.sh"
    fi
  else
    log_warn "Origin lockdown not applied (APPLY_ORIGIN_LOCKDOWN=0)."
  fi

  if [[ "$APPLY_CLOUDFLARE_WAF" == "1" ]]; then
    if [[ -n "${CF_API_TOKEN:-}" && -n "${CF_ZONE_ID:-}" ]]; then
      log_info "Applying Cloudflare WAF/rate-limit rules..."
      "$SCRIPT_DIR/apply-cloudflare-waf-rules.sh"
    else
      log_warn "Skipping Cloudflare WAF apply: CF_API_TOKEN / CF_ZONE_ID missing."
      log_warn "Run: CF_API_TOKEN=... CF_ZONE_ID=... $SCRIPT_DIR/apply-cloudflare-waf-rules.sh"
    fi
  else
    log_warn "Cloudflare WAF apply disabled (APPLY_CLOUDFLARE_WAF=0)."
  fi

  echo
  echo "[DONE] Final hardening bootstrap completed."
  echo "[NEXT] Verify externally:"
  echo "       curl -I https://$DOMAIN"
  echo "       curl -k -I --resolve $DOMAIN:443:46.101.209.56 https://$DOMAIN"
  echo "[NOTE] HEALTHCHECK_TOKEN has been set in: $SERVER_ENV_FILE"
}

main "$@"
