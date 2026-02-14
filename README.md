---
title: Agentic Dashboard
last_updated: 2026-02-13
---

# Agentic Dashboard & Services

Master agent that delegates tasks to specialized agents (planner, coder, email, etc.), with a React dashboard to track tasks, agents, delegation runs, and chat/plan/codegen history. Local-first, Ollama-friendly, and extensible via plugins.

## Stack
- **Frontend**: React/TypeScript dashboard (port 3002 dev)
- **Backend**: Express master-agent API (port 3001) + auto-delegation scheduler
- **Agent runtime**: agent-service (port 7788) for plan/codegen/delegate/execute, SSE streaming
- **RAG**: shared-rag (port 7777)
- **LLM host**: Ollama (port 11434) - or external providers (OpenRouter, OpenAI, Anthropic, xAI)
- **DB**: SQLite via Sequelize (`master-agent/database.sqlite`)

## Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Dashboard  │────▶│   master-agent  │────▶│agent-service │
│  (React/TS)  │◀────│    (Express)    │◀────│  (Ollama)    │
└──────────────┘     └────────┬────────┘     └──────┬───────┘
                              │                     │
                              ▼                     ▼
                       ┌────────────┐        ┌──────────────┐
                       │  SQLite DB │        │  shared-rag  │
                       └────────────┘        └──────────────┘
```

## Core Features

### Task Management
- Create, edit, delete tasks with priority levels (low/medium/high/urgent)
- Task status tracking: pending, in_progress, completed, failed, review
- Auto-delegate to agents with configurable interval (default 5 minutes)
- Delegation runs persisted with full event history

### Agents
- Registry with capabilities and models
- Auto-bootstrap default agents if none exist
- Multiple agent types: email, coding, general, time-management, social-media, investment

### Chat/Plan/Codegen
- SSE streaming for real-time output
- Stop/cancel support
- History persisted (ChatLog/PlanLog)
- Model selection with automatic fallbacks

### Autonomous Execution (`/execute`)
- ReAct-style loop with configurable max iterations (default 6)
- Returns thought/action/observation for each step
- Supports `needs_clarification` status when agent needs user input
- Clarification modal in UI for human-in-the-loop

### Templates
- Quick "Use" to prefill chat input
- Category-based organization

### Settings
- Profile (name/display persona)
- Model defaults and fallbacks
- RAG toggle, K value, planner timeout
- Auto-delegate interval configuration

### Workflows
- Bootstrap workflows for agent initialization
- JSON-based workflow definitions in `master-agent/workflows/`

### Provider Support
- **Ollama** (default): Local models
- **OpenRouter**: API-compatible with OpenAI format
- **OpenAI**: Direct API access
- **Anthropic/Claude**: Anthropic Messages API
- **xAI**: Grok models
- **Custom HTTP**: Any OpenAI-compatible endpoint

### VSCode Extension
- `agent.planAnswer`: Generate plan for selected code
- `agent.codegen`: Generate code from prompt
- `agent.summarize`: Summarize selected code
- `agent.refreshIndex`: Refresh RAG index
- `agent.selectModel`: Configure model settings
- Configurable RAG URL, agent URL, and model defaults

## Quickstart (local)

```bash
# Prereqs: Node 18+, Ollama running with models pulled

# 1) shared-rag (requires OLLAMA_URL and EMBED_MODEL env)
cd shared-rag && npm install && npm start

# 2) agent-service
cd ../agent-service && npm install && npm start

# 3) master-agent API (creates database.sqlite if missing)
cd ../master-agent && npm install && npm start

# 4) dashboard (dev)
cd client && npm install && npm start  # opens http://localhost:3002
```

## Environment Variables

### agent-service/.env
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 7788 | Service port |
| `PLANNER_MODEL` | gemma3:1b | Default planner model |
| `CODER_MODEL` | qwen2.5-coder:14b | Default coder model |
| `FALLBACK_PLANNER_MODEL` | codellama:instruct | Fallback planner |
| `FALLBACK_CODER_MODEL` | codellama:7b-instruct-q4_0 | Fallback coder |
| `RAG_URL` | http://127.0.0.1:7777 | RAG service URL |
| `OLLAMA_URL` | http://127.0.0.1:11434 | Ollama API URL |
| `OLLAMA_TIMEOUT_MS` | 120000 | Request timeout (ms) |
| `OLLAMA_RETRIES` | 0 | Retry count on failure |
| `ALLOWED_ORIGINS` | http://localhost:3002 | CORS origins |

### master-agent/.env
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | API server port |
| `CLIENT_PORT` | 3002 | Dashboard port |
| `DELEGATE_URL` | http://localhost:7788/delegate | Delegation endpoint |
| `AUTO_DELEGATE_ENABLED` | true | Enable auto-delegation |
| `DELEGATION_INTERVAL_MS` | 300000 | Sweep interval (5 min) |
| `RECENT_DELEGATION_AGE_MS` | 300000 | Skip recent tasks |
| `STARTUP_WORKFLOWS_ENABLED` | true | Run startup workflows |
| `STARTUP_WORKFLOWS_CONCURRENCY` | 2 | Parallel workflow steps |
| `CLASSIFIER_MODEL` | gemma3:1b | Task classification model |

### shared-rag/.env
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 7777 | Service port |
| `OLLAMA_URL` | (required) | Ollama API URL |
| `EMBED_MODEL` | (required) | Embedding model |
| `WORKSPACE_ROOT` | ../ | Code root directory |
| `RAG_INCLUDE` | src/**,app/**,... | File patterns to index |
| `RAG_EXCLUDE` | node_modules/**,... | Patterns to exclude |
| `CHUNK_SIZE` | 1200 | Text chunk size |

---

## Agent System

### Agent Capabilities

The system defines several specialized agents, each with specific keywords for automatic task classification:

| Agent | Keywords | Description |
|-------|----------|-------------|
| `coding-agent` | code, program, debug, fix bug, implement, refactor, test, deploy, api, database, frontend, backend | Handles coding tasks: writing, debugging, code review |
| `email-agent` | email, mail, send, inbox, reply, forward, newsletter, smtp, meeting invite | Handles email operations |
| `investment-agent` | invest, stock, portfolio, market, trade, crypto, dividend, roi, financial | Handles investment research and analysis |
| `social-media-agent` | social, post, tweet, instagram, linkedin, content, engagement, followers | Handles social media management |
| `time-management-agent` | schedule, calendar, reminder, deadline, priority, time block, meeting | Handles scheduling and productivity |

### Task Classification

When a task is delegated, the system classifies it to find the best agent:

**Phase 1 - Keyword Scoring:**
- Match task title/description against agent keywords
- Multi-word matches score higher
- If score >= 2 and confidence calculable, return result

**Phase 2 - LLM Classification (fallback):**
- Use LLM to classify task based on agent descriptions
- Returns confidence score of 0.7

**Phase 3 - Default Fallback:**
- If no match, defaults to `coding-agent`

---

## Startup Workflows

Startup workflows run automatically when master-agent starts to prime agents with context and perform initialization tasks.

### How It Works

1. On startup, `runStartupWorkflows()` loads JSON workflow files from `master-agent/workflows/`
2. Only workflows with `"schedule": "startup"` are executed
3. Each workflow step creates a task if one with the same `runKey` doesn't exist
4. Tasks are delegated to the specified agent with `autonomous: true`
5. Workflow runs are tracked in the `WorkflowRun` model

### Workflow File Format

```json
{
  "name": "workflow-name",
  "description": "What this workflow does",
  "agent": "coding-agent",
  "auto": true,
  "priority": "medium",
  "schedule": "startup",
  "steps": [
    {
      "title": "Step title",
      "description": "Step description",
      "priority": "high"
    }
  ]
}
```

### Built-in Workflows

| Workflow | Agent | Steps |
|----------|-------|-------|
| bootstrap-coding-agent | coding-agent | Index codebase, List open issues |
| bootstrap-email-agent | email-agent | Check inbox, List pending drafts |
| bootstrap-general-agent | general | Daily standup summary |
| bootstrap-investment-agent | investment-agent | Market status check |
| bootstrap-social-media-agent | social-media-agent | Content calendar review |
| bootstrap-time-management-agent | time-management-agent | Today's schedule review |

### Workflow Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `STARTUP_WORKFLOWS_ENABLED` | true | Enable/disable workflows |
| `STARTUP_WORKFLOWS_MAX` | 20 | Max workflow files to load |
| `STARTUP_WORKFLOWS_CONCURRENCY` | 2 | Parallel step execution |
| `STARTUP_WORKFLOWS_RETRIES` | 1 | Retry attempts on failure |
| `WORKFLOWS_DIR` | workflows/ | Workflow directory |

---

## Task Delegation Flow

### Manual Delegation

```
1. User creates task → Task saved to SQLite (status: pending)
2. User clicks "Delegate" or calls POST /delegate/:taskId
3. delegateTask() is invoked:
   a. classifyTask() determines best agent (keyword + LLM fallback)
   b. Agent auto-registered if not exists
   c. TaskDelegation record created (status: queued)
   d. Task status → delegated
4. executeDelegate() runs asynchronously:
   a. Task status → in_progress
   b. Call agent-service /execute with specialized prompt
   c. ReAct loop runs (thought/action/observation)
   d. On completion: status → completed/review/failed
5. Results stored in TaskDelegation
```

### Auto-Delegation (Scheduler)

```
1. Master-agent starts with AUTO_DELEGATE_ENABLED=true
2. Interval timer runs every DELEGATION_INTERVAL_MS (default 5 min)
3. For each pending task:
   a. Skip if status is in_progress/completed/failed/review
   b. Skip if updated recently (RECENT_DELEGATION_AGE_MS)
   c. Call delegateTask() same as manual
```

### Specialized Agent Prompts

Each agent type receives a tailored prompt for better results:

**coding-agent:**
```
You are a senior software engineer. Task: {title}
Description: {description}
Priority: {priority}

Respond as JSON with: summary, files[], testStrategy, risks
```

**email-agent:**
```
You are an email assistant. Task: {title}
Provide: draft content, recipients, subject, follow-ups
```

**investment-agent:**
```
You are a financial analyst. Task: {title}
Provide: market analysis, risk assessment, recommendations
```

---

## Human-in-the-Loop (Clarification)

When the autonomous agent needs user input:

1. Agent returns `status: needs_clarification` with questions array
2. Task status set to `pending` (not completed)
3. Dashboard shows clarification modal
4. User provides answers via `POST /delegate/:taskId/clarify`
5. Delegation resumes with clarifications in context

```
User Answer → clarifications[] in task.metadata → Re-delegate with context
```

---

## API Endpoints

### master-agent (port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET/POST | /tasks | List/create tasks |
| PUT/DELETE | /tasks/:id | Update/delete task |
| POST | /tasks/:id/delegate | Trigger delegation |
| GET | /agents | List agents |
| POST | /agents/register | Register new agent |
| POST | /agents/bootstrap | Bootstrap default agents |
| GET | /delegations | List delegation runs |
| GET | /delegations/:taskId | Get delegations for task |
| POST | /delegations/:taskId/clarify | Submit clarification answers |
| POST | /delegate/:taskId/delegate | Delegate task |
| POST | /delegate/:taskId/execute | Execute synchronously |
| POST | /delegate/:taskId/classify | Preview agent selection |
| POST | /delegate/:taskId/delegate/chain | Sequential multi-agent handoff |
| POST | /delegate/:taskId/delegate/parallel | Parallel multi-agent execution |
| GET | /delegate/:taskId/delegations/stream | SSE delegation stream |
| GET | /delegate/capabilities | List agent capabilities |
| POST | /delegate/delegations/:id/approve | Approve delegation |
| POST | /delegate/delegations/:id/reject | Reject delegation |
| GET/POST | /suggestions | Manage suggestions |
| GET/POST | /templates | Manage templates |
| GET/PUT | /profile | Get/update profile |
| GET/POST | /chat | Chat with history |
| GET/POST | /workflows | Manage workflows |

### agent-service (port 7788)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /models | List available Ollama models |
| POST | /plan | Generate plan (non-streaming) |
| POST | /plan/stream | Generate plan (SSE) |
| POST | /codegen | Generate code (non-streaming) |
| POST | /codegen/stream | Generate code (SSE) |
| POST | /execute | Autonomous ReAct loop |
| POST | /delegate | Delegate to agents (SSE) |

### shared-rag (port 7777)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| POST | /search | Semantic search |
| POST | /reindex | Rebuild index |
| POST | /ingest/text | Ingest raw text |
| POST | /ingest/url | Ingest URL content |
| POST | /ingest/file | Ingest file content |

## Models (Suggested)

| Role | Primary Model | Fallback |
|------|---------------|----------|
| Planner | codellama:7b-instruct-q4_0 | gemma3:1b |
| Coder | qwen2.5-coder:14b | codellama:instruct |
| Classifier | gemma3:1b | codellama:instruct |
| Embedding | nomic-embed-text | - |

## Operational Notes

- Ensure `logs/` and `database.sqlite` are writable
- Restart services after env changes; dotenv loads automatically
- Run `ollama list` to verify models are available
- Master-agent logs show sweep start/complete for auto-delegation
- RAG index auto-rebuilds on first search if empty
- Web search fallback uses DuckDuckGo if local results empty
- Startup workflows run in parallel (configurable concurrency)
- Workflow tasks use runKey to prevent duplicates per day

---

## Potential Improvements

### Short-term Enhancements

1. **Enhanced Agent Selection UI**
   - Show confidence score and reasoning in dashboard
   - Allow manual override of auto-selected agent
   - Preview classification before delegating

2. **Better Workflow UI**
   - Dashboard page to manage workflows
   - Enable/disable workflows without editing JSON
   - View workflow run history and results

3. **Improved Error Handling**
   - Retry with fallback model on failure
   - Circuit breaker for failing agents
   - Dead letter queue for failed tasks

### Medium-term Enhancements

4. **Multi-Agent Collaboration**
   - Sequential handoff: Planner → Coder → Reviewer
   - Parallel agent execution with result aggregation
   - Agent-to-agent communication

5. **Advanced Classification**
   - ML-based classifier trained on delegation history
   - Confidence calibration
   - Learning from user overrides

6. **Workflow Scheduling**
   - Cron-style schedules (daily, weekly)
   - Event-triggered workflows (on task create, on delegation)
   - Conditional workflow execution

### Long-term Enhancements

7. **Plugin System**
   - GitHub plugin for repo access
   - Google Calendar integration
   - Custom agent capabilities

8. **Production Ready**
   - Postgres database with migrations
   - Authentication and authorization
   - Rate limiting and quotas

## Project Structure

```
localcode/
├── README.md                    # This file
├── master-agent/                # Main API server
│   ├── index.js                 # Express app entry
│   ├── routes/                  # API route handlers
│   ├── models/                  # Sequelize models
│   ├── services/                # Business logic
│   │   ├── DelegationEngine.js  # Task classification & delegation
│   │   └── startupWorkflows.js  # Startup workflow runner
│   ├── plugins/                 # Plugin system
│   ├── workflows/               # Bootstrap workflow definitions
│   └── client/                  # React dashboard
│       └── src/components/
│           └── dashboard/        # Modular dashboard widgets
├── agent-service/               # Ollama/AI runtime
│   └── server.js                # All endpoints
├── shared-rag/                  # RAG service
│   └── server.js                # Search & indexing
├── vscode-agent/                # VSCode extension
│   └── src/
│       ├── commands/            # CLI commands
│       └── services/            # Agent service client
└── docs/                        # Archived docs
```

## Roadmap

### Completed
- [x] Multi-agent collaboration (sequential handoff) - `POST /delegate/:taskId/delegate/chain`
- [x] Multi-agent collaboration (parallel execution) - `POST /delegate/:taskId/delegate/parallel`

### In Progress
- [ ] Dashboard for workflow management
- [ ] ML-based classifier with learning from user overrides
- [ ] Cron-style workflow scheduling
- [ ] GitHub/Gmail/Google Calendar plugins

### Future
- [ ] Agent-service callbacks/polling for task completion
- [ ] Surface delegation logs in dashboard
- [ ] Metrics dashboard widget
- [ ] Postgres migration for production
