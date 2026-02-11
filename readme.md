# Local Agentic Workspace

This workspace hosts three deliverables:
- `vscode-agent/`: VSCode extension for planner/coder/summarizer with local/remote model registry and RAG hooks.
- `agent-service/`: Standalone Node service exposing REST endpoints for planner/coder, pulling context from shared-rag and calling Ollama.
- `zed-agent/`: Zed extension scaffold (plan + placeholders).
- `shared-rag/`: Shared Node helper for indexing/retrieval (Ollama embeddings, local store).
- `master-agent/`: Web dashboard (tasks/agents CRUD, filters/search, plan/codegen actions with RAG, model/k controls).

All code is local-first; do not index secrets (`.env`, credentials, binaries). Use Ollama for embeddings and generation by default; cloud providers are configurable via settings or env.

## Ollama install (no snap/systemd)
If snap/systemd is unavailable in WSL, use tarball:
```bash
cd /tmp
curl -fsSLO https://github.com/ollama/ollama/releases/download/v0.5.7/ollama-linux-amd64.tgz
sudo tar -C /usr/local -xzf ollama-linux-amd64.tgz
sudo ln -sf /usr/local/bin/ollama /usr/bin/ollama
sudo /usr/local/bin/ollama serve >/tmp/ollama.log 2>&1 &
/usr/local/bin/ollama pull qwen2.5-coder:14b
```
Adjust version as needed.

## Adding/using local models (Ollama)
- List installed: `ollama list`
- Pull new: `ollama pull <model>` (e.g., `ollama pull gemma3:1b`)
- Agent-service (backend) primary/fallback models via env:
  - `PLANNER_MODEL`, `CODER_MODEL`, `FALLBACK_PLANNER_MODEL`, `FALLBACK_CODER_MODEL`
- Dashboard (frontend) lets you override per-call: set planner/coder model fields before Plan/Codegen.
- VSCode extension defaults: configured via settings (see above) and can be changed to any local model.

## Current State (Feb 11, 2026)
- Services: shared-rag (7777), agent-service (7788) with Ollama calls/retries/fallbacks, master-agent API (3001), dashboard (3002) with drag/drop layout.
- Dashboard: tasks/agents CRUD, filters/search, modals, toasts, delete confirmations, resizable main/secondary columns, draggable widgets (Tasks, Agents, Plan/Codegen result), per-call model + RAG k controls.
- Agent-service: real `/plan` and `/codegen` hitting Ollama, context from RAG, error details, optional fallback models.
- VSCode extension: commands call agent-service and shared-rag.

## Goals / Next Steps
- Persist widget layout and model/RAG selections; add nav actions for sidebar items.
- Surface agent-service error detail/model tried in UI toasts/results.
- Optional: Markdown rendering for plan/codegen, better empty states and loading skeletons.
- Optional: CLI/Electron (Phase 5) after model integration proves stable.

## Dashboard UI controls
- Planner/Coder model fields: override models per Plan/Codegen call.
- RAG k: controls retrieved context chunk count per call.
- Filters/search: status/priority filters for tasks; search for tasks/agents.
- Modals: create/edit tasks and agents; plan/codegen results in a modal; toasts and delete confirmations.

Screenshots (place under `./screenshots`):
- `dashboard-main.png`: dashboard with tasks/agents lists and controls.
- `dashboard-plan.png`: plan/codegen result modal.

## Architecture
- `shared-rag` (port 7777): Indexes code/docs (include globs in `server.js`), chunks, embeds via Ollama (`EMBED_MODEL`, default `nomic-embed-text`), serves `/reindex` and `/search`.
- `agent-service` (port 7788): Orchestrates planner/coder via Ollama models (`PLANNER_MODEL`, `CODER_MODEL`) and pulls context from `shared-rag` (`RAG_URL`). Supports retries/fallbacks (`FALLBACK_PLANNER_MODEL`, `FALLBACK_CODER_MODEL`, `OLLAMA_RETRIES`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_URL`). Endpoints: `/plan`, `/codegen`.
- `vscode-agent`: Front-end commands; currently configured to use `agent-service` for plan/codegen and `shared-rag` for retrieval. Models also remain available for direct calls if re-enabled.

## Run services
- Shared RAG (port 7777):
  ```bash
  cd shared-rag
  chmod +x start.sh
  ./start.sh
  ```
- Agent service (port 7788):
  ```bash
  cd agent-service
  chmod +x start.sh
  ./start.sh
  ```
- Master-agent UI (port 3002 dev server) + API (3001):
  ```bash
  cd master-agent
  npm run start        # API on 3001
  cd client
  npm start            # React dev server on 3002
  ```

Quick links (after services are running):
- Dashboard: http://localhost:3002
- API health: http://localhost:3001/health
- Agent-service plan: POST http://localhost:7788/plan
- Agent-service codegen: POST http://localhost:7788/codegen

## Architecture Summary
- The `shared-rag` service indexes code and documents, and serves as a retrieval endpoint for the `agent-service`.
- The `agent-service` orchestrates the planner and coder, using Ollama models and pulling context from `shared-rag`.
- The `vscode-agent` extension provides front-end commands, using the `agent-service` for plan and code generation, and `shared-rag` for retrieval.

## Service Endpoints
- `shared-rag`:
  - `/reindex`: Re-indexes the code and documents.
  - `/search`: Searches for code and documents.
- `agent-service`:
  - `/plan`: Generates a plan using the planner model (uses RAG if `context.useRAG` true). Respects `model` in body, otherwise `PLANNER_MODEL`, with fallback if configured.
  - `/codegen`: Generates code using the coder model (uses RAG if `context.useRAG` true). Respects `model` in body, otherwise `CODER_MODEL`, with fallback if configured.

## Windows vs WSL
- WSL path: `/mnt/d/WindsurfProjects/localcode/...`
- Windows path: `D:\WindsurfProjects\localcode\...`
- Use WSL shells to run the Bash start scripts; PowerShell cannot run them directly. If you need PowerShell launchers, create `.ps1` wrappers.

## VSCode extension settings (user settings)
```json
{
  "agent.ragServiceUrl": "http://127.0.0.1:7777",
  "agent.agentServiceUrl": "http://127.0.0.1:7788",
  "agent.defaultPlanner": "llama3.1:8b",
  "agent.defaultCoder": "qwen2.5-coder:14b",
  "agent.defaultSummarizer": "llama3.1:8b"
}