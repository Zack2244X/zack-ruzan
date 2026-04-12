#!/usr/bin/env bash
set -e

HEALTH_URL="http://localhost:3000/api/health"
MAX_RETRIES=15
RETRY_DELAY=5

echo "Starting post-deployment smoke test..."
echo "Waiting for $HEALTH_URL to return HTTP 200..."

for ((i=1; i<=MAX_RETRIES; i++)); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "failed")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Success! Deployment is healthy. (Attempt $i/$MAX_RETRIES)"
    exit 0
  fi
  echo "⚠️ Attempt $i: received $HTTP_STATUS, retrying in $RETRY_DELAY seconds..."
  sleep $RETRY_DELAY
done

echo "❌ Error: Deployment health check failed after $MAX_RETRIES attempts."
echo "Application appears to be down or unreachable. Check container logs."
exit 1
