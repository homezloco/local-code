#!/bin/bash
HOST="http://127.0.0.1:3001"
AGENT_HOST="http://127.0.0.1:7788"

# Use a temp directory for output to avoid triggering nodemon
TMP_DIR=$(mktemp -d)
echo "Using temp dir: $TMP_DIR"

echo "1. Checking Master Agent Health..."
curl -v "$HOST/health"
echo ""

echo "2. Checking Agent Service Connectivity..."
# Checking if Agent Service is listening on 7788
if curl -v "$AGENT_HOST/check-health-endpoint" 2>&1 | grep -q "Connection refused"; then
  echo "ERROR: Agent Service (port 7788) is NOT reachable."
  exit 1
else
  echo "Agent Service is reachable (at least network-wise)."
fi
echo ""

echo "3. Creating Task..."
curl -v -X POST "$HOST/tasks" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Delegation Flow","description":"Verify flow","priority":"high"}' -o "$TMP_DIR/task_create.json"

echo "Task Creation Output:"
cat "$TMP_DIR/task_create.json"
echo ""

# Node extraction from temp file
TASK_ID=$(node -e "try { const data = require('$TMP_DIR/task_create.json'); console.log(data.id); } catch(e) { console.error('JSON Parse Error:', e.message); }")

if [ -z "$TASK_ID" ] || [ "$TASK_ID" = "undefined" ]; then
  echo "Error: Failed to get Task ID."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "Task ID: $TASK_ID"

echo "4. Delegating Task..."
curl -v -X POST "$HOST/api/delegate/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"autonomous":true}' -o "$TMP_DIR/delegation_result.json"

echo "Delegation Output:"
cat "$TMP_DIR/delegation_result.json"
echo ""

echo "5. Waiting for processing (120s max). Check logs for 'fetch failed'..."
# Loop validation could happen here, but simple wait is safer for now
sleep 15

echo "6. Fetching History..."
curl -v -X GET "$HOST/api/delegate/$TASK_ID/delegations" -o "$TMP_DIR/history.json"

echo "History Output:"
cat "$TMP_DIR/history.json"
echo ""

# Cleanup
rm -rf "$TMP_DIR"
echo "Done."
