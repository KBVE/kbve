#!/bin/bash
set -e

# Build, deploy, and test edge runtime locally
# Usage: ./scripts/dev.sh

# Change to repo root directory
cd "$(dirname "$0")/.."

# Load .env file if it exists
if [ -f .env ]; then
  echo "Loading environment from .env file..."
  set -a
  source .env
  set +a
fi

IMAGE_NAME="edge-functions"
CONTAINER_NAME="edge-functions-dev"
PORT="${PORT:-9000}"
MAX_WAIT=30

# Default JWT secret for dev testing
JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-for-dev}"

# Generate a JWT for testing (HS256)
# Usage: generate_jwt [role]
#   role: "service_role" (default) or "anon" or "authenticated"
generate_jwt() {
  local role="${1:-service_role}"
  local header='{"alg":"HS256","typ":"JWT"}'
  local payload='{"role":"'"$role"'","iss":"supabase","iat":'"$(date +%s)"',"exp":'"$(($(date +%s) + 3600))"'}'

  local header_b64=$(echo -n "$header" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
  local payload_b64=$(echo -n "$payload" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
  local signature=$(echo -n "${header_b64}.${payload_b64}" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

  echo "${header_b64}.${payload_b64}.${signature}"
}

# Step 1: Build docker image
echo "=== Step 1: Building edge functions image ==="
docker build -t $IMAGE_NAME .
echo "Image built successfully"
echo ""

# Step 2: Deploy the container
echo "=== Step 2: Deploying container ==="
docker rm -f $CONTAINER_NAME 2>/dev/null || true

docker run -d \
  --name $CONTAINER_NAME \
  -p $PORT:9000 \
  -e JWT_SECRET="$JWT_SECRET" \
  -e VERIFY_JWT="${VERIFY_JWT:-true}" \
  -e SUPABASE_URL="${SUPABASE_URL:-http://host.docker.internal:54321}" \
  -e SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}" \
  -e SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}" \
  $IMAGE_NAME \
  start --main-service /home/deno/functions/main

echo "Container deployed"
echo ""

# Step 3: Wait for port to be active and test
echo "=== Step 3: Waiting for service to be ready ==="
elapsed=0
while ! curl -s "http://localhost:$PORT" > /dev/null 2>&1; do
  if [ $elapsed -ge $MAX_WAIT ]; then
    echo "Timeout waiting for service to start"
    echo "Container logs:"
    docker logs $CONTAINER_NAME
    exit 1
  fi
  echo "  Waiting for port $PORT... (${elapsed}s)"
  sleep 1
  elapsed=$((elapsed + 1))
done
echo "Service is ready on port $PORT"
echo ""

# Step 4: Test vault-reader function
echo "=== Step 4: Testing vault-reader function ==="
TEST_JWT=$(generate_jwt)
echo "Generated test JWT: ${TEST_JWT:0:50}..."
echo ""

echo "Testing vault-reader endpoint..."
TEST_UUID="39781c47-be8f-4a10-ae3a-714da299ca07"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:$PORT/vault-reader" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d "{\"command\":\"get\",\"secret_id\":\"$TEST_UUID\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response (HTTP $HTTP_CODE):"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
  echo "Vault-reader function responded successfully"
else
  echo "Vault-reader function returned an error"
  exit 1
fi

# Step 5: Test unauthorized access (should fail)
echo ""
echo "=== Step 5: Testing unauthorized access (should be denied) ==="
ANON_JWT=$(generate_jwt "anon")
echo "Generated anon JWT: ${ANON_JWT:0:50}..."
echo ""

echo "Testing vault-reader with anon role (expecting 403)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:$PORT/vault-reader" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_JWT" \
  -d "{\"command\":\"get\",\"secret_id\":\"$TEST_UUID\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response (HTTP $HTTP_CODE):"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -eq 403 ]; then
  echo "Anon user correctly denied access (403 Forbidden)"
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "Anon user correctly denied access (401 Unauthorized)"
else
  echo "Expected 401/403 but got $HTTP_CODE - security check may have failed!"
  exit 1
fi

echo ""
echo "=== All tests passed ==="
echo ""
echo "=== Development server running ==="
echo "URL: http://localhost:$PORT"
echo ""
echo "Commands:"
echo "  Logs:  docker logs -f $CONTAINER_NAME"
echo "  Stop:  docker rm -f $CONTAINER_NAME"
