# Master Agent

The Master Agent is the central coordination hub for the Local Agentic Assistant ecosystem. It manages task delegation, agent registration, workflow orchestration, and provides the React dashboard.

## Features

- **Task Management**: Create, track, and manage tasks with priority levels and status tracking
- **Agent Registry**: Dynamic registration of specialized agents with capabilities
- **Auto-Delegation**: Scheduler that automatically delegates pending tasks to agents
- **Profile Management**: User profile with model preferences and RAG settings
- **Workflows**: Bootstrap workflows for agent initialization
- **REST API**: Comprehensive API for all operations

## Quick Start

1. **Install Dependencies**
   ```bash
   cd master-agent
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file (copy from `.env.example` if available):
   ```
   PORT=3001
   CLIENT_PORT=3002
   DELEGATE_URL=http://localhost:7788/delegate
   AUTO_DELEGATE_ENABLED=true
   DELEGATION_INTERVAL_MS=300000
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

   The server will create `database.sqlite` if it doesn't exist.

4. **Start the Dashboard** (in separate terminal)
   ```bash
   cd client
   npm install
   npm start
   ```

## API Endpoints

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /tasks | List all tasks |
| GET | /tasks/:id | Get task by ID |
| POST | /tasks | Create new task |
| PUT | /tasks/:id | Update task |
| DELETE | /tasks/:id | Delete task |
| POST | /tasks/:id/delegate | Trigger delegation |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /agents | List all agents |
| GET | /agents/:id | Get agent by ID |
| POST | /agents/register | Register new agent |
| POST | /agents/bootstrap | Bootstrap default agents |
| PUT | /agents/:id | Update agent |
| DELETE | /agents/:id | Delete agent |

### Delegations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /delegations | List all delegation runs |
| GET | /delegations/:taskId | Get delegations for task |
| POST | /delegations/:taskId/clarify | Submit clarification answers |
| GET | /delegate/:taskId/delegations/stream | SSE stream for task |

### Other Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | /suggestions | Manage suggestions |
| GET/POST | /templates | Manage templates |
| GET/PUT | /profile | Get/update profile |
| GET/POST | /chat | Chat with history |
| GET/POST | /workflows | Manage workflows |

## Database Schema

SQLite database with the following models:

- **Task**: id, title, description, status, priority, createdAt, updatedAt
- **Agent**: id, name, displayName, description, capabilities, models, status
- **DelegationRun**: id, taskId, status, events, result, createdAt, updatedAt
- **ChatLog**: id, role, content, model, createdAt
- **PlanLog**: id, prompt, response, model, createdAt
- **MasterProfile**: id, name, displayName, persona, traits, variables
- **Template**: id, title, description, category, agents, inputs, steps
- **Suggestion**: id, title, body, agentName, confidence, score, status
- **WorkflowRun**: id, workflowId, status, result, createdAt

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| CLIENT_PORT | 3002 | Dashboard port |
| DELEGATE_URL | http://localhost:7788/delegate | Delegation endpoint |
| AUTO_DELEGATE_ENABLED | true | Enable auto-delegation |
| DELEGATION_INTERVAL_MS | 300000 | Sweep interval (5 min) |
| RECENT_DELEGATION_AGE_MS | 300000 | Skip recent tasks |

## Task Delegation Flow

1. User creates task → status: pending
2. Scheduler sweeps every `DELEGATION_INTERVAL_MS`
3. For pending tasks, POST to agent-service `/delegate`
4. Task status → in_progress → completed/failed based on result
5. If needs_clarification, status → review, show modal in UI
6. User answers clarification → delegation resumes

## Dashboard

React-based dashboard at http://localhost:3002 with:

- Task list with filters and search
- Agent management
- Chat panel for plan/codegen
- Delegation timeline with SSE streaming
- Settings for profile and model preferences
- Template management
- Suggestions display
