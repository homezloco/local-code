# Local Agentic Workspace

This workspace hosts:
- `master-agent/`: Web dashboard (tasks/agents CRUD, filters/search, draggable widgets, adjustable main/secondary columns, plan/codegen with RAG, model/RAG controls, presets, persistence).
- `agent-service/`: Planner/coder endpoints hitting Ollama (with retries/fallbacks/RAG) and supporting custom provider/apiKey/endpoint overrides.
- `shared-rag/`: Retrieval service using Ollama embeddings (with keyword fallback).
- `vscode-agent/`: VSCode extension wired to agent-service and shared-rag.
- `zed-agent/`: Zed extension scaffold.

All code is local-first; do not commit secrets (`.env`, credentials, binaries). Default dev DB: SQLite. Postgres is planned for production.

## Models (local + API)
- Local (Ollama): set `PLANNER_MODEL`, `CODER_MODEL`, `FALLBACK_*` envs; dashboard model dropdowns support installed/local IDs (including codellama variants) and custom entries.
- API providers: add a custom model with provider (OpenRouter/OpenAI/Claude/xAI/HTTP) and optional API key/endpoint; the dashboard sends provider/apiKey/endpoint in the plan/codegen payload. API keys are stored only in the browser (localStorage).
- RAG k and model choices are persisted in localStorage along with layout and filters/search.

## Current State (Feb 11, 2026)
- Services: shared-rag (7777), agent-service (7788), master-agent API (3001), dashboard (3002 dev).
- Dashboard: CRUD, filters/search, modals/toasts/confirmations, draggable widgets (Tasks, Agents, Plan/Codegen), resizable columns, layout presets, loading skeletons, markdown result rendering, model/provider controls, persisted preferences.
- Agent-service: real `/plan` and `/codegen` with Ollama + RAG + retries/fallbacks; accepts provider/apiKey/endpoint overrides.
- VSCode extension: commands call agent-service/shared-rag; settings include URLs and model defaults.

## Run services (dev)
- Shared RAG (7777):
  ```bash
  cd shared-rag
  chmod +x start.sh
  ./start.sh
  ```
- Agent service (7788):
  ```bash
  cd agent-service
  chmod +x start.sh
  ./start.sh
  ```
- Master-agent API/UI (3001/3002):
  ```bash
  cd master-agent
  npm run start        # API on 3001 (SQLite dev DB)
  cd client
  npm start            # React dev server on 3002
  ```

Quick links:
- Dashboard: http://localhost:3002
- API health: http://localhost:3001/health
- Agent-service plan: POST http://localhost:7788/plan
- Agent-service codegen: POST http://localhost:7788/codegen

## Service Endpoints
- `shared-rag`: `/reindex`, `/search`
- `agent-service`: `/plan`, `/codegen` (model/provider overrides, RAG context)

## Windows vs WSL
- WSL path: `/mnt/d/WindsurfProjects/localcode/...`
- Windows path: `D:\WindsurfProjects\localcode\...`
- Run Bash start scripts from WSL; PowerShell needs wrappers if desired.

## VSCode extension settings (user settings)
```json
{
  "agent.ragServiceUrl": "http://127.0.0.1:7777",
  "agent.agentServiceUrl": "http://127.0.0.1:7788",
  "agent.defaultPlanner": "llama3.1:8b",
  "agent.defaultCoder": "qwen2.5-coder:14b",
  "agent.defaultSummarizer": "llama3.1:8b"
}
```
