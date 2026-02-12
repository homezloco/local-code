#!/usr/bin/env bash
set -euo pipefail 2>/dev/null || set -euo
cd "$(dirname "$0")"

PORT="${PORT:-7777}"
export OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
export EMBED_MODEL="${EMBED_MODEL:-nomic-embed-text:latest}"

required_env=("OLLAMA_URL" "EMBED_MODEL")
missing=()
for k in "${required_env[@]}"; do
  if [ -z "${!k:-}" ]; then
    missing+=("$k")
  fi
done

if [ ${#missing[@]} -ne 0 ]; then
  echo "Missing required env vars: ${missing[*]}" >&2
  exit 1
fi

echo "Starting shared-rag on port $PORT (OLLAMA_URL=$OLLAMA_URL, EMBED_MODEL=$EMBED_MODEL)"

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

export PORT
node server.js
