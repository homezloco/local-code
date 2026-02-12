#!/usr/bin/env bash
set -euo pipefail 2>/dev/null || set -euo
cd "$(dirname "$0")"

PORT=${PORT:-7788}

# Kill any process using the port
if command -v fuser >/dev/null 2>&1; then
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti tcp:"$PORT" | xargs -r kill -9 || true
fi

# Install deps if missing
if [ ! -d node_modules ]; then
  npm install
fi

npm start
