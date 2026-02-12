#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3002}"

# Kill any process using the port
if command -v fuser >/dev/null 2>&1; then
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti tcp:"$PORT" | xargs -r kill -9 || true
elif command -v ss >/dev/null 2>&1; then
  ss -ltnp | awk -v p=":${PORT}" '$4 ~ p {print $6}' | cut -d',' -f2 | cut -d'=' -f2 | xargs -r kill -9 || true
elif command -v netstat >/dev/null 2>&1; then
  netstat -tulpn 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p {print $7}' | cut -d'/' -f1 | xargs -r kill -9 || true
fi

# Install deps if missing
if [ ! -d node_modules ]; then
  npm install
fi

export PORT
npm start
