---
title: Agentic Dashboard
last_updated: 2026-02-12
---

# Agentic Dashboard & Services

Master agent that delegates tasks to specialized agents (planner, coder, email, etc.), with a React dashboard to track tasks, agents, delegation runs, and chat/plan/codegen history. Local-first, Ollama-friendly, and extensible via plugins.

## Stack
- Frontend: React/TypeScript dashboard (port 3002 dev)
- Backend: Express master-agent API (port 3001) + auto-delegation scheduler
- Agent runtime: agent-service (port 7788) for plan/codegen/delegate, SSE streaming
- RAG: shared-rag (port 7777)
- LLM host: Ollama (port 11434)
- DB: SQLite via Sequelize (`master-agent/database.sqlite`)

## Core Features
- Task lifecycle: create tasks, auto-delegate every 60s, show latest delegation run in UI, persist DelegationRuns.
- Chat/plan/codegen: SSE streaming, stop/cancel, history persisted (ChatLog/PlanLog), model selection with fallbacks.
- Agents: registry with capabilities/models; auto-bootstrap default agents if none exist.
- Templates: quick “Use” to prefill chat input.
- Settings: profile (name/display persona), model defaults/fallbacks, RAG toggle/K, planner timeout.
- Plugins: PluginManager loads classes from `plugins/`, skipping BasePlugin/manager files.

## Quickstart (local)
```bash
# Prereqs: Node 18+, Ollama running with models pulled (e.g., codellama:7b-instruct-q4_0, gemma3:1b, qwen2.5-coder:14b)

# 1) shared-rag
cd shared-rag && npm install && npm start

# 2) agent-service
cd ../agent-service && npm install && npm start

# 3) master-agent API (creates database.sqlite if missing)
cd ../master-agent && npm install && npm start

# 4) dashboard (dev)
cd client && npm install && npm start  # opens http://localhost:3002
```

## Environment (key)
- `agent-service/.env`: `PLANNER_MODEL`, `FALLBACK_PLANNER_MODEL`, `CODER_MODEL`, `FALLBACK_CODER_MODEL`, `RAG_URL`, `OLLAMA_URL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_RETRIES`.
- `master-agent/.env`: `PORT` (3001), `CLIENT_PORT` (3002), `DELEGATE_URL` (default `http://localhost:7788/delegate`), DB path `database.sqlite`.

## Task Delegation Flow
1) master-agent scheduler selects non-completed tasks every 60s.
2) Posts `{ task, agents[] }` to agent-service `/delegate` (SSE).
3) Task status set to `in_progress` before send; on successful POST it is marked `completed`, else `failed` (callback-based completion pending).
4) DelegationRun rows store run metadata; dashboard shows latest run per task.

## API Highlights
- master-agent: `GET/POST /tasks`, `PUT/DELETE /tasks/:id`, `POST /tasks/delegate`, `GET /agents`, `POST /agents/register`, `GET /suggestions/summary`, `POST /suggestions/ingest`, `GET /delegations`.
- agent-service: `POST /plan`, `POST /codegen`, `POST /delegate` (SSE), `GET /models`, `GET /health`.
- shared-rag: `POST /search`.

## Models Installed (suggested)
- Planner: `codellama:7b-instruct-q4_0` (fallback `gemma3:1b`)
- Coder: `qwen2.5-coder:14b` (fallback `codellama:instruct`)

## Operational Notes
- Ensure `logs/` and `database.sqlite` are writable.
- Restart each service after env changes; dotenv is loaded automatically.
- `ollama list` to verify models; avoid requesting missing models.
- Auto-delegate runs every 60s on master-agent startup; logs show sweep start/complete.

## Roadmap
- Agent-service callbacks/polling to mark tasks completed/failed/needs_user_input based on agent output (not just POST success).
- Surface delegation logs and input-needed prompts in dashboard with approve/adjust replies.
- Plugins: GitHub repo access, Google login/email, voice/local options.
- Health/metrics surfacing in dashboard; migration to Postgres for production.
