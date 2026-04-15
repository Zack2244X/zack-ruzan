#!/usr/bin/env bash
set -euo pipefail

# Applies custom Cloudflare WAF and rate-limit rules from local JSON payloads.
# Idempotent: replaces only script-managed rule descriptions, preserves other rules.
# Required env vars:
#   CF_API_TOKEN  - token with Zone WAF + Rate Limit permissions
#   CF_ZONE_ID    - target Cloudflare zone id
# Optional:
#   CF_ACCOUNT_ID - only needed in some account-scoped operations

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WAF_RULES_JSON="$SCRIPT_DIR/cloudflare/waf-custom-rules.json"
RATE_LIMIT_JSON="$SCRIPT_DIR/cloudflare/rate-limit-auth.json"

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "[ERROR] CF_API_TOKEN is required." >&2
  exit 1
fi

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  echo "[ERROR] CF_ZONE_ID is required." >&2
  exit 1
fi

if [[ ! -f "$WAF_RULES_JSON" ]]; then
  echo "[ERROR] Missing payload: $WAF_RULES_JSON" >&2
  exit 1
fi

if [[ ! -f "$RATE_LIMIT_JSON" ]]; then
  echo "[ERROR] Missing payload: $RATE_LIMIT_JSON" >&2
  exit 1
fi

api_base="https://api.cloudflare.com/client/v4"
auth_header=("-H" "Authorization: Bearer $CF_API_TOKEN")
json_header=("-H" "Content-Type: application/json")

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] node is required to merge JSON payloads safely." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cf_request() {
  local method="$1"
  local url="$2"
  local out_file="$3"
  local data_file="${4:-}"

  if [[ -n "$data_file" ]]; then
    curl -sS -X "$method" "$url" \
      "${auth_header[@]}" "${json_header[@]}" \
      --data @"$data_file" >"$out_file"
  else
    curl -sS -X "$method" "$url" \
      "${auth_header[@]}" "${json_header[@]}" >"$out_file"
  fi

  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!payload.success) {
      console.error(JSON.stringify(payload.errors || payload, null, 2));
      process.exit(1);
    }
  ' "$out_file"
}

build_merged_payload() {
  local existing_file="$1"
  local desired_file="$2"
  local out_file="$3"

  node -e '
    const fs = require("fs");
    const existing = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const desired = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const outFile = process.argv[3];

    const existingRules = Array.isArray(existing.result?.rules) ? existing.result.rules : [];
    const desiredRules = Array.isArray(desired.rules)
      ? desired.rules
      : desired.rule
        ? [desired.rule]
        : [];

    const descriptions = new Set(
      desiredRules
        .map((r) => (typeof r.description === "string" ? r.description.trim() : ""))
        .filter(Boolean),
    );

    const preserved = existingRules.filter((rule) => {
      const desc = typeof rule.description === "string" ? rule.description.trim() : "";
      return !descriptions.has(desc);
    });

    const merged = [...preserved, ...desiredRules];
    const payload = {
      description: "Managed by scripts/apply-cloudflare-waf-rules.sh",
      rules: merged,
    };

    fs.writeFileSync(outFile, JSON.stringify(payload));
  ' "$existing_file" "$desired_file" "$out_file"
}

# 1) Update zone entrypoint for custom WAF rules (http_request_firewall_custom).
echo "[INFO] Updating Cloudflare custom firewall rules..."
waf_entrypoint_url="$api_base/zones/$CF_ZONE_ID/rulesets/phases/http_request_firewall_custom/entrypoint"
waf_existing_file="$tmp_dir/waf_existing.json"
waf_payload_file="$tmp_dir/waf_payload.json"
waf_update_file="$tmp_dir/waf_update.json"

cf_request GET "$waf_entrypoint_url" "$waf_existing_file"
cp "$WAF_RULES_JSON" "$waf_payload_file"
build_merged_payload "$waf_existing_file" "$waf_payload_file" "$waf_update_file"
cf_request PUT "$waf_entrypoint_url" "$tmp_dir/waf_result.json" "$waf_update_file"

# 2) Update zone entrypoint for rate limit rules (http_ratelimit).
echo "[INFO] Updating Cloudflare rate limit rules..."
ratelimit_entrypoint_url="$api_base/zones/$CF_ZONE_ID/rulesets/phases/http_ratelimit/entrypoint"
rl_existing_file="$tmp_dir/rl_existing.json"
rl_payload_file="$tmp_dir/rl_payload.json"
rl_update_file="$tmp_dir/rl_update.json"

cf_request GET "$ratelimit_entrypoint_url" "$rl_existing_file"
cp "$RATE_LIMIT_JSON" "$rl_payload_file"
build_merged_payload "$rl_existing_file" "$rl_payload_file" "$rl_update_file"
cf_request PUT "$ratelimit_entrypoint_url" "$tmp_dir/rl_result.json" "$rl_update_file"

echo "[DONE] Cloudflare WAF and rate-limit rules are synced successfully."
