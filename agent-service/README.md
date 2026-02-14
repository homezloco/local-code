# Agent Service

The Agent Service provides the AI runtime for plan/codegen/delegate/execute operations. It connects to Ollama or external providers to generate responses.

## Features

- **Plan Generation**: Generate plans for tasks
- **Code Generation**: Generate code from prompts
- **Autonomous Execution**: ReAct-style loop with iteration tracking
- **Delegation**: Coordinate multiple agents
- **Multi-Provider**: Ollama, OpenRouter, OpenAI, Anthropic, xAI
- **SSE Streaming**: Real-time output streaming

## Quick Start

1. **Install Dependencies**
   ```bash
   cd agent-service
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file:
   ```
   PORT=7788
   PLANNER_MODEL=gemma3:1b
   CODER_MODEL=qwen2.5-coder:14b
   FALLBACK_PLANNER_MODEL=codellama:instruct
   FALLBACK_CODER_MODEL=codellama:7b-instruct-q4_0
   RAG_URL=http://127.0.0.1:7777
   OLLAMA_URL=http://127.0.0.1:11434
   OLLAMA_TIMEOUT_MS=120000
   ```

3. **Start the Service**
   ```bash
   npm start
   ```

## API Endpoints

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

## Endpoints Detail

### POST /plan

Generate a plan for a task.

**Request:**
```json
{
  "prompt": "Create a REST API",
  "context": { "useRAG": true, "k": 8 },
  "model": "gemma3:1b",
  "provider": "ollama",
  "apiKey": "optional-key",
  "endpoint": "optional-override-url"
}
```

**Response:**
```json
{
  "plan": "Step 1: Design API endpoints...",
  "context": [...],
  "modelTried": "gemma3:1b",
  "fallbackTried": "codellama:instruct"
}
```

### POST /codegen

Generate code from a prompt.

**Request:**
```json
{
  "prompt": "Create a simple React counter component",
  "context": { "useRAG": false },
  "model": "qwen2.5-coder:14b"
}
```

**Response:**
```json
{
  "code": "import React, { useState } from 'react';\n...",
  "modelTried": "qwen2.5-coder:14b"
}
```

### POST /execute

Run autonomous ReAct loop.

**Request:**
```json
{
  "task": "Create a REST API",
  "context": { "useRAG": true, "k": 8 },
  "maxIterations": 6,
  "model": "gemma3:1b"
}
```

**Response:**
```json
{
  "task": "Create a REST API",
  "status": "final_answer",
  "finalAnswer": "Done! Created API with endpoints...",
  "iterations": [
    {
      "thought": "I need to create a REST API",
      "action": "codegen",
      "observation": "Generated Express server code",
      "status": "continue"
    }
  ],
  "events": [...]
}
```

The `/execute` endpoint returns:
- `status`: "continue", "final_answer", "needs_clarification", or "error"
- `iterations`: Array of {thought, action, observation, status}
- `finalAnswer`: Final result when status is "final_answer"
- `events`: All events emitted during execution

### POST /delegate

Delegate task to multiple agents (SSE).

**Request:**
```json
{
  "task": "Build a todo app",
  "agents": [
    { "name": "planner", "capabilities": ["planning"] },
    { "name": "coder", "capabilities": ["coding"] }
  ],
  "context": { "useRAG": true, "k": 8 }
}
```

**SSE Events:**
- `start`: Task started
- `plan`: Delegation plan generated
- `agent_result`: Agent completed
- `agent_error`: Agent failed
- `done`: All agents completed
- `error`: Overall failure
- `ping`: Heartbeat

## Provider Configuration

### Ollama (default)
```json
{
  "provider": "ollama"
}
```

### OpenRouter
```json
{
  "provider": "openrouter",
  "apiKey": "your-key"
}
```

### OpenAI
```json
{
  "provider": "openai",
  "apiKey": "your-key"
}
```

### Anthropic/Claude
```json
{
  "provider": "anthropic",
  "apiKey": "your-key"
}
```

### xAI
```json
{
  "provider": "xai",
  "apiKey": "your-key"
}
```

### Custom HTTP
```json
{
  "provider": "http",
  "endpoint": "https://your-endpoint.com/v1/chat/completions",
  "apiKey": "your-key"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 7788 | Service port |
| PLANNER_MODEL | gemma3:1b | Default planner model |
| CODER_MODEL | qwen2.5-coder:14b | Default coder model |
| FALLBACK_PLANNER_MODEL | codellama:instruct | Fallback planner |
| FALLBACK_CODER_MODEL | codellama:7b-instruct-q4_0 | Fallback coder |
| RAG_URL | http://127.0.0.1:7777 | RAG service URL |
| OLLAMA_URL | http://127.0.0.1:11434 | Ollama API URL |
| OLLAMA_TIMEOUT_MS | 120000 | Request timeout (ms) |
| OLLAMA_RETRIES | 0 | Retry count on failure |
| ALLOWED_ORIGINS | http://localhost:3002 | CORS origins |
