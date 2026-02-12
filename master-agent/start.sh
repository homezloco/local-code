#!/usr/bin/env bash
set -euo pipefail

# Run from the master-agent root
cd "$(dirname "$0")"

# Ports
BACKEND_PORT="${PORT:-3001}"
CLIENT_PORT="${CLIENT_PORT:-3002}"
PORTS=("$BACKEND_PORT" "$CLIENT_PORT")

kill_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"${port}" | xargs -r kill -9 || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp | awk -v p=":${port}" '$4 ~ p {print $6}' | cut -d',' -f2 | cut -d'=' -f2 | xargs -r kill -9 || true
  elif command -v netstat >/dev/null 2>&1; then
    netstat -tulpn 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print $7}' | cut -d'/' -f1 | xargs -r kill -9 || true
  elif [ -n "${WSL_DISTRO_NAME:-}" ] && command -v powershell.exe >/dev/null 2>&1; then
    # If running under WSL, also attempt to kill Windows-side listeners on this port
    powershell.exe -NoLogo -NonInteractive -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1 || true
  fi
}

for p in "${PORTS[@]}"; do
  kill_port "$p"
done

# Install backend deps if missing
if [ ! -d node_modules ]; then
  npm install
fi

# Install client deps if missing
if [ ! -d client/node_modules ]; then
  (cd client && npm install)
fi

export PORT="$BACKEND_PORT"
export CLIENT_PORT

# Start both backend (nodemon) and client
if npx --yes concurrently --version >/dev/null 2>&1; then
  npx --yes concurrently \
    --kill-others-on-fail \
    --names "backend,client" \
    "PORT=$BACKEND_PORT npm run dev" \
    "PORT=$CLIENT_PORT npm run client"
else
  # Fallback: start backend then client
  PORT="$BACKEND_PORT" npm run dev &
  BACKEND_PID=$!
  (PORT="$CLIENT_PORT" cd client && npm start) || {
    kill "$BACKEND_PID" 2>/dev/null || true
    exit 1
  }
  wait "$BACKEND_PID"
fi
