#!/usr/bin/env bash
set -euo pipefail

# Quick health checks for local services.
# Default ports can be overridden via env vars.
MA_PORT="${MA_PORT:-3001}"
RAG_PORT="${RAG_PORT:-7777}"
AGENT_PORT="${AGENT_PORT:-7788}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"

print_status() {
  local name="$1" url="$2" status="$3" detail="$4"
  printf "%-14s %-6s %s\n" "$name" "$status" "$detail"
}

check() {
  local name="$1" url="$2"
  local status detail
  if response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url"); then
    status="$response"
    detail="$url"
  else
    status="ERR"
    detail="$url"
  fi
  print_status "$name" "$status" "$detail"
}

echo "== Health Checks =="
check "master-agent" "http://127.0.0.1:${MA_PORT}/health"
check "shared-rag"   "http://127.0.0.1:${RAG_PORT}/health"
check "agent-service" "http://127.0.0.1:${AGENT_PORT}/health"
check "ollama"       "http://127.0.0.1:${OLLAMA_PORT}/api/tags"

echo "(override ports via MA_PORT/RAG_PORT/AGENT_PORT/OLLAMA_PORT)"
