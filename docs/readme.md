---
title: Project Overview
last_updated: 2026-02-12
---

# Agentic Dashboard & Services

## Goals
- Provide a master agent that delegates tasks to specialized agents (planner, coder, etc.), with optional auto-delegation.
- Enable RAG-augmented planning/codegen via Ollama and shared-rag.
- Offer a usable dashboard for managing tasks, agents, plans, and code suggestions with selectable text and clear feedback.
- Keep services lightweight and self-hosted, with sensible fallbacks and observability.

## Current Implementation
- **Services**: master-agent API (3001), dashboard (3002 dev), agent-service (7788), shared-rag (7777), Ollama (11434).
- **Agent-service**: `/plan`, `/codegen`, `/delegate` with RAG, model selection, provider overrides, fallbacks, and timeouts. Env via `.env` (dotenv loaded).
- **Master-agent**: task CRUD, agent registry, delegation runs, suggestions clustering, templates, auto-delegate scheduler (60s) posting to agent-service delegate.
- **Dashboard**: CRUD UI, filters/search, modals/toasts/confirmations, draggable/resizable layout, markdown rendering, model/provider controls, persisted prefs, selectable text.
- **Database**: SQLite via Sequelize; tables: Tasks, Agents, Suggestions, DelegationRuns, Templates.
- **Logging**: Winston to `logs/combined.log` and `logs/error.log` (master-agent) plus console; agent-service logs to console.

### Architecture (textual)
- **Frontend (dashboard)** → calls **master-agent API** on 3001 for tasks/agents/suggestions/templates and for delegation -> master-agent posts to **agent-service** delegate.
- **Agent-service** on 7788 → reaches **Ollama** 11434 for LLM; reaches **shared-rag** 7777 for context; streams SSE for delegate.
- **Data**: SQLite file `database.sqlite` shared by master-agent. Suggestions/DelegationRuns persisted for history.
- **Plugins**: master-agent `plugins/` loaded via PluginManager (skips BasePlugin/manager files); plugin classes instantiated and registered.

### Key Endpoints
- master-agent
  - `GET /tasks`, `POST /tasks`, `PUT /tasks/:id`, `DELETE /tasks/:id`
  - `POST /tasks/delegate` → forwards to agent-service `/delegate`
  - `GET /agents`, `POST /agents/register`, `PUT /agents/:id`, etc.
  - `GET /suggestions/summary`, `POST /suggestions/ingest`
  - `GET /delegations` (DelegationRuns)
- agent-service
  - `POST /plan` (aliases: prompt|question|task)
  - `POST /codegen` (aliases: prompt|task|question)
  - `POST /delegate` (SSE; expects task + agents[])
  - `GET /models` (Ollama tags), `GET /health`
- shared-rag
  - `POST /search` returning `results: [{path, snippet, offset}]`

### Data Models (Sequelize)
- **Task**: id, title, description, status, priority, assignedTo, dueDate, metadata, timestamps.
- **Agent**: id, name, displayName, description, capabilities (array), models (array), endpoints, healthUrl, metadata (preferredModel), status/version, timestamps.
- **Suggestion**: id, title, body, tags, agentName, confidence/score, status, clusterId, fingerprint, availableAt, metadata, timestamps.
- **DelegationRun**: id, taskId, taskTitle, status, events (JSON), metadata, timestamps.
- **Template**: id, title, description, category, agents, inputs, steps, isCustom, metadata, timestamps.

### Workflows
- **Planning**: Dashboard → agent-service `/plan` with prompt/question; agent-service optional RAG → Ollama model → returns plan + context.
- **Codegen**: Dashboard → agent-service `/codegen`; RAG optional; returns diff.
- **Delegation (manual & auto)**:
  1. master-agent selects pending tasks (status != done) every 60s (auto) or via API.
  2. Posts `{ task, agents[] }` to agent-service `/delegate` (SSE).
  3. agent-service may fetch RAG context, generate high-level plan with planner model, then per-agent subtasks in parallel; streams `start/plan/agent_result/agent_error/done` events.
  4. master-agent logs sweep start/complete; DelegationRuns can persist outcomes (master-agent route available).
- **Suggestions**: Ingest via `/suggestions/ingest`; summary clusters returned from `/suggestions/summary` with guard for missing tables.

## Features
- Task management with delegation (manual + auto every 60s).
- Agent registry with capabilities/models/metadata and preferred model support.
- Planning and codegen via Ollama with RAG context retrieval (shared-rag).
- Delegation SSE stream with per-agent results and heartbeat pings.
- Suggestions ingest + summary clustering; UI shows summaries.
- UI quality: draggable cards limited to headers (text is selectable), markdown rendering with light/dark theme support.

## Configuration (key envs)
- `agent-service/.env`:
  - `PLANNER_MODEL` (e.g., `codellama:instruct` or faster `codellama:7b-instruct-q4_0`)
  - `FALLBACK_PLANNER_MODEL` (e.g., `gemma3:1b`)
  - `CODER_MODEL` (`qwen2.5-coder:14b`), `FALLBACK_CODER_MODEL`
  - `RAG_URL` (default `http://127.0.0.1:7777`)
  - `OLLAMA_URL` (default `http://127.0.0.1:11434`)
  - `OLLAMA_TIMEOUT_MS` (default 120000; currently set to 480000)
  - `OLLAMA_RETRIES` (default 0)
- `master-agent/.env`:
  - `PORT` (3001), `CLIENT_PORT` (3002), `DELEGATE_URL` (default `http://localhost:7788/delegate`)
  - DB path: `database.sqlite` in repo root; ensure writable.

### Model Defaults (installed set)
- Available locally: `codellama:instruct`, `codellama:7b-instruct-q4_0`, `gemma3:1b`, `qwen2.5-coder:14b`.
- Suggested planner default: `codellama:7b-instruct-q4_0`; fallback `gemma3:1b`.
- Suggested coder default: `qwen2.5-coder:14b`; fallback `codellama:instruct`.

### Operations
- Restart agent-service after env changes (`npm start` in agent-service). Dotenv auto-loads `.env`.
- Ensure `logs/` and `database.sqlite` are writable (chmod u+w if needed).
- Auto-delegate runs every 60s on master-agent startup; logs show sweep start/complete and per-task delegation.
- `ollama list` to confirm models; avoid requesting missing models (prevents 404/abort).

## Remaining Tasks / Known Issues
- **Plan timeouts**: Long-running planner calls can still abort if model is slow; consider smaller planner model, tuned timeout, and limited context size.
- **Model availability**: Avoid referencing models not present (e.g., `qwen2.5:3b`); set defaults to installed models.
- **Ollama warnings**: `rope_frequency_base` warnings are noisy; harmless but consider updating model/config to suppress.
- **Delegation UX**: Dashboard could expose timeout/model controls for delegation and show clearer error states on aborts.
- **Monitoring**: Add lightweight request logging/metrics for agent-service (morgan or pino) and health checks in master-agent UI.
- **Tests**: Add regression tests for /plan, /delegate flows and schema migrations (Sequelize migrations or seed checks).

### Troubleshooting
- **AbortError / operation aborted**: The Ollama call exceeded timeout or client closed. Use smaller model (planner: `codellama:7b-instruct-q4_0`), ensure `OLLAMA_TIMEOUT_MS` high enough, and keep `RAG` k small.
- **Model not found**: Run `ollama list`; set `PLANNER_MODEL`/`CODER_MODEL` to installed IDs; use `FALLBACK_*`.
- **DB errors (missing column/table)**: Run master-agent once to sync; ensure file writable; consider Sequelize migrations for production.
- **CORS/UI**: Allowed origins set via `ALLOWED_ORIGINS` in agent-service.
- **Delegation stalls**: Check agent-service logs for `/delegate` stream; verify agents array is non-empty and models installed.

## Recommendations
- Set planner defaults to a fast, installed model (`codellama:7b-instruct-q4_0`) with fallback `gemma3:1b` to reduce aborts.
- Keep `OLLAMA_TIMEOUT_MS` aligned with typical generation time; prefer faster models over very long timeouts to avoid hung sockets.
- Add `OLLAMA_RETRIES=1` if transient failures persist, but monitor latency.
- Surface model/timeout settings in dashboard for delegation and planning so users can choose per-run.
- Add health and status indicators in the dashboard for agent-service and shared-rag.
- Schedule periodic DB backups; ensure `logs/` and `database.sqlite` remain writable.
- Consider adding schema migrations (Sequelize CLI) to avoid manual column adds.

### Deployment Notes (local-first)
- Keep secrets in `.env` (never commit). For production, prefer Postgres over SQLite; migrate via Sequelize migrations.
- Run services: shared-rag (7777), agent-service (7788), master-agent (3001), dashboard (3002). Ensure Ollama reachable at 11434 or set `OLLAMA_URL`.
- For CI/CD, add `npm test`/lint steps and `ollama pull` for required models on the host.

## Quick Test Commands
- Plan (available model):
  ```bash
  curl -s http://localhost:7788/plan \
    -H "Content-Type: application/json" \
    -d '{"question":"test plan","context":{"useRAG":false},"model":"codellama:instruct"}'
  ```
- Delegate via master-agent:
  ```bash
  curl -s http://localhost:3001/tasks/delegate \
    -H "Content-Type: application/json" \
    -d '{"task":"demo delegation","agents":[{"name":"planner"}],"context":{"useRAG":false}}'
  ```

## Operational Notes
- Restart agent-service after env changes (`npm start` in agent-service). Dotenv is loaded automatically.
- Auto-delegate runs every 60s in master-agent startup; logs indicate sweeps and outcomes.
- Ensure Ollama is running with required models pulled (`ollama list`).
