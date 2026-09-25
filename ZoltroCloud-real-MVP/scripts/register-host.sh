#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://localhost:8080}"
curl -sS "$API/api/hosts/register" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"${HOST_NAME:-gpu-01}\",\"region\":\"${REGION:-eu-west}\",\"endpoint\":\"${ENDPOINT:-http://gpu-host:8090}\"}"
echo
