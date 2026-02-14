import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { mkdirSync } from 'fs';
import { createLogger, format as winstonFormat, transports as winstonTransports } from 'winston';

// Universal fetch shim to support Node versions without global fetch and to ensure the value is a function
const fetch =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch
    : (url, options) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(url, options));

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import mcpService from './services/MCPService.js';

const logDir = join(__dirname, 'logs');
mkdirSync(logDir, { recursive: true });

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winstonFormat.combine(winstonFormat.timestamp(), winstonFormat.errors({ stack: true }), winstonFormat.json()),
  transports: [new winstonTransports.Console(), new winstonTransports.File({ filename: join(logDir, 'app.log') })]
});

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
};

const app = express();

app.use(express.json());

const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || 'http://localhost:3002,http://127.0.0.1:3002';
const allowedOrigins = allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow non-browser or same-origin
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
  })
);

const PORT = process.env.PORT || 7788;
const RAG_URL = process.env.RAG_URL || 'http://127.0.0.1:7777';
const PLANNER_MODEL = process.env.PLANNER_MODEL || 'gemma3:1b';
const CODER_MODEL = process.env.CODER_MODEL || 'qwen2.5-coder:14b';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const FALLBACK_PLANNER_MODEL = process.env.FALLBACK_PLANNER_MODEL || 'codellama:instruct';
const FALLBACK_CODER_MODEL = process.env.FALLBACK_CODER_MODEL || 'codellama:7b-instruct-q4_0';

const OLLAMA_RETRIES = Number(process.env.OLLAMA_RETRIES || 0);

const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);

// Simple cache of Ollama tags to avoid 404 on missing models
let cachedModels = null;
let cachedAt = 0;
const MODEL_CACHE_MS = 60_000;

async function listOllamaModels() {
  const now = Date.now();
  if (cachedModels && now - cachedAt < MODEL_CACHE_MS) return cachedModels;
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`tags list failed ${response.status}: ${text}`);
    }
    const data = await response.json();
    cachedModels = (data?.models || []).map((m) => m?.name).filter(Boolean);
    cachedAt = now;
    return cachedModels;
  } catch (err) {
    logger.error('Ollama tags fetch error', { message: err?.message || err });
    return cachedModels || [];
  }
}

async function selectModel(requested, fallbackDefault) {
  const model = requested || fallbackDefault;
  // Only validate Ollama models; for external providers assume caller knows.
  const models = await listOllamaModels();
  if (models.includes(model)) return model;
  logger.warn(`Model ${model} not found in Ollama tags; falling back to ${fallbackDefault}`);
  return fallbackDefault;
}

const resolveProvider = (providerPayload) => {
  const provider = (providerPayload?.provider || 'ollama').toLowerCase();
  const apiKey = providerPayload?.apiKey;
  const overrideEndpoint = providerPayload?.endpoint;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  switch (provider) {
    case 'openrouter':
      return { url: overrideEndpoint || 'https://openrouter.ai/api/v1/generate', headers };
    case 'openai':
      return { url: overrideEndpoint || 'https://api.openai.com/v1/completions', headers };
    case 'anthropic':
    case 'claude':
      return { url: overrideEndpoint || 'https://api.anthropic.com/v1/messages', headers };
    case 'xai':
      return { url: overrideEndpoint || 'https://api.x.ai/v1/chat/completions', headers };
    case 'http':
      return { url: overrideEndpoint || `${OLLAMA_URL}/api/generate`, headers };
    case 'ollama':
    default:
      return { url: overrideEndpoint || `${OLLAMA_URL}/api/generate`, headers };
  }
};

const callOllama = async (model, prompt, fallbackModel = null, providerPayload = {}, { stream = false, formatJson = false } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  let lastErr;
  const modelsToTry = [model, ...(fallbackModel ? [fallbackModel] : [])];

  let attempt = 0;
  try {
    for (const m of modelsToTry) {
      attempt += 1;
      try {
        const { url, headers } = resolveProvider(providerPayload);
        const body = { model: m, prompt, stream: Boolean(stream) };
        if (formatJson) body.format = 'json';
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Ollama error ${response.status} (${m}): ${text}`);
        }
        if (!stream) {
          const data = await response.json();
          return data.response || '';
        }

        // Streaming path
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader for streaming response');
        const decoder = new TextDecoder();
        const chunks = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(decoder.decode(value, { stream: true }));
        }
        chunks.push(decoder.decode());
        return chunks.join('');
      } catch (err) {
        lastErr = err;
        if (attempt > OLLAMA_RETRIES + (fallbackModel ? 1 : 0)) break;
      }
    }
    throw lastErr || new Error('Unknown Ollama error');
  } finally {
    clearTimeout(timer);
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Models list endpoint (Ollama tags)
app.get('/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: 'Failed to list models', detail: text });
    }
    const data = await response.json();
    const models = (data?.models || []).map((m) => m?.name).filter(Boolean);
    res.json({ models });
  } catch (error) {
    logger.error('List models error', { error: error?.message || String(error) });
    res.status(502).json({ error: 'Failed to list models', detail: error?.message || String(error) });
  }
});

// Cancel endpoint
app.post('/cancel', async (req, res) => {
  try {
    const { taskId } = req.body;
    // In a real implementation, we would track active tasks and abort their controllers.
    // For now, we'll just log it and potentially implement a global map of active tasks.
    logger.info(`Received cancellation request for task: ${taskId}`);
    res.json({ status: 'cancelled', taskId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// MCP Management Endpoints
app.post('/mcp/connect', async (req, res) => {
  try {
    const { name, command, args, env } = req.body;
    await mcpService.connectStdio(name, { command, args, env });
    res.json({ status: 'connected', name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/mcp/tools', async (req, res) => {
  try {
    const tools = await mcpService.listTools();
    res.json({ tools });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Plan streaming endpoint (SSE)
app.post('/plan/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { prompt: rawPrompt, question, task, context } = req.body || {};
    const prompt = rawPrompt || question || task;
    if (!prompt) {
      sendEvent('error', { message: 'prompt is required' });
      return res.end();
    }

    let ragContext = [];
    let ragError = null;
    if (context?.useRAG) {
      try {
        const response = await fetch(`${RAG_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: prompt, k: context.k || 8 })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`RAG search failed ${response.status}: ${text}`);
        }
        const data = await response.json();
        ragContext = data.results || [];
      } catch (err) {
        ragError = err?.message || String(err);
        logger.warn('Plan stream RAG fetch failed, continuing without context', { detail: ragError });
        sendEvent('warn', { message: 'RAG fetch failed, continuing without context', detail: ragError });
      }
    }

    const ctxText = ragContext
      .map((c, idx) => `# Context ${idx + 1}\n${c.text || c.content || ''}`)
      .join('\n\n');
    const fullPrompt = `${prompt}\n\nContext:\n${ctxText}`;
    const model = await selectModel(req.body.model, PLANNER_MODEL);
    const providerPayload = {
      provider: req.body.provider,
      apiKey: req.body.apiKey,
      endpoint: req.body.endpoint
    };

    await streamOllama({ res, model, prompt: fullPrompt, fallbackModel: FALLBACK_PLANNER_MODEL, providerPayload });
  } catch (error) {
    logger.error('Plan stream error', { error: error?.message || String(error) });
    sendEvent('error', { message: 'Failed to generate plan', detail: error?.message || String(error) });
  } finally {
    res.end();
  }
});

// Plan endpoint
app.post('/plan', async (req, res) => {
  try {
    const { prompt: rawPrompt, question, task, context } = req.body || {};
    const prompt = rawPrompt || question || task;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    // Get context from RAG if needed
    let ragContext = [];
    let ragError = null;
    if (context?.useRAG) {
      try {
        const response = await fetch(`${RAG_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: prompt, k: context.k || 8 })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`RAG search failed ${response.status}: ${text}`);
        }
        const data = await response.json();
        ragContext = data.results || [];
      } catch (err) {
        ragError = err?.message || String(err);
        logger.error('Plan RAG fetch error, continuing without context', { detail: ragError });
      }
    }

    const ctxText = ragContext
      .map((c, idx) => `# Context ${idx + 1}\n${c.text || c.content || ''}`)
      .join('\n\n');
    const fullPrompt = `${prompt}\n\nContext:\n${ctxText}`;
    const model = await selectModel(req.body.model, PLANNER_MODEL);
    const providerPayload = {
      provider: req.body.provider,
      apiKey: req.body.apiKey,
      endpoint: req.body.endpoint
    };
    const plan = await callOllama(model, fullPrompt, FALLBACK_PLANNER_MODEL, providerPayload);
    res.json({
      plan,
      context: ragContext,
      ragError,
      modelTried: model,
      fallbackTried: FALLBACK_PLANNER_MODEL,
      provider: providerPayload.provider
    });
  } catch (error) {
    logger.error('Plan error', { error: error?.message || String(error) });
    res.status(502).json({ error: 'Failed to generate plan', detail: error?.message || String(error) });
  }
});

// Codegen streaming endpoint (SSE)
app.post('/codegen/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { prompt, context } = req.body;
    if (!prompt) {
      sendEvent('error', { message: 'prompt is required' });
      return res.end();
    }

    let ragContext = [];
    let ragError = null;
    if (context?.useRAG) {
      try {
        const response = await fetch(`${RAG_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: prompt, k: context.k || 8 })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`RAG search failed ${response.status}: ${text}`);
        }
        const data = await response.json();
        ragContext = data.results || [];
      } catch (err) {
        ragError = err?.message || String(err);
        logger.warn('Codegen stream RAG fetch failed, continuing without context', { detail: ragError });
        sendEvent('warn', { message: 'RAG fetch failed, continuing without context', detail: ragError });
      }
    }

    const ctxText = ragContext
      .map((c, idx) => `# Context ${idx + 1}\n${c.text || c.content || ''}`)
      .join('\n\n');
    const fullPrompt = `Task:\n${prompt}\n\nContext:\n${ctxText}\n\nProduce code or a patch. If uncertain, explain next steps.`;
    const model = await selectModel(req.body.model, CODER_MODEL);
    const providerPayload = {
      provider: req.body.provider,
      apiKey: req.body.apiKey,
      endpoint: req.body.endpoint
    };

    await streamOllama({ res, model, prompt: fullPrompt, fallbackModel: FALLBACK_CODER_MODEL, providerPayload });
  } catch (error) {
    logger.error('Codegen stream error', { error: error?.message || String(error) });
    sendEvent('error', { message: 'Failed to generate code', detail: error?.message || String(error) });
  } finally {
    res.end();
  }
});

// Codegen endpoint
app.post('/codegen', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    let ragContext = [];
    if (context?.useRAG) {
      const response = await fetch(`${RAG_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: prompt, k: context.k || 8 })
      });
      const data = await response.json();
      ragContext = data.results || [];
    }
    const ctxText = ragContext
      .map((c, idx) => `# Context ${idx + 1}\n${c.text || c.content || ''}`)
      .join('\n\n');
    const fullPrompt = `Task:\n${prompt}\n\nContext:\n${ctxText}\n\nProduce code or a patch. If uncertain, explain next steps.`;
    const model = await selectModel(req.body.model, CODER_MODEL);
    const providerPayload = {
      provider: req.body.provider,
      apiKey: req.body.apiKey,
      endpoint: req.body.endpoint
    };
    const code = await callOllama(model, fullPrompt, FALLBACK_CODER_MODEL, providerPayload);
    res.json({ code, context: ragContext, modelTried: model, fallbackTried: FALLBACK_CODER_MODEL, provider: providerPayload.provider });
  } catch (error) {
    logger.error('Codegen error', { error: error?.message || String(error) });
    res.status(502).json({ error: 'Failed to generate code', detail: error?.message || String(error) });
  }
});

// Execute endpoint (supports overridePrompt)
app.post('/execute', async (req, res) => {
  try {
    const { task, overridePrompt, context = {}, maxIterations = 6, autonomous = true } = req.body || {};
    const taskInput = overridePrompt || task;
    if (!taskInput || typeof taskInput !== 'string') {
      return res.status(400).json({ error: 'task is required' });
    }

    let ragContext = [];
    let ragError = null;
    if (context?.useRAG) {
      try {
        const response = await fetch(`${RAG_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: taskInput, k: context.k || 8 })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`RAG search failed ${response.status}: ${text}`);
        }
        const data = await response.json();
        ragContext = data.results || [];
      } catch (err) {
        ragError = err?.message || String(err);
        logger.warn('Execute RAG fetch failed', { detail: ragError });
      }
    }

    const ctxText = ragContext
      .map((c, idx) => `# Context ${idx + 1}\n${c.text || c.content || ''}`)
      .join('\n\n');

    const iterations = [];
    const events = [];

    const model = await selectModel(req.body.model, PLANNER_MODEL);
    const providerPayload = {
      provider: req.body.provider,
      apiKey: req.body.apiKey,
      endpoint: req.body.endpoint
    };

    const baseSystem = `You are an autonomous AI agent.
Your goal is to complete the task by executing a sequence of actions.
You can use tools (if available) or rely on your internal knowledge.

Response Format (JSON only):
{
  "thought": "Reasoning about what to do next",
  "action": "The specific action/tool to run or 'final_answer'",
  "observation": "Arguments for the tool (JSON) or the final answer text",
  "status": "continue|final_answer|needs_clarification|error",
  "nextTasks": [ { "title": "...", "description": "...", "priority": "low|medium|high|urgent" } ]
}
Rules:
1. "nextTasks": Optional array. Include ONLY when you have completed the main goal (status="final_answer") but see clear follow-up work needed.
2. If status is "final_answer", observation is the result.
3. If input is a tool output, use it to determine the next step.`;

    // Fetch available tools
    let mcpTools = [];
    try {
      mcpTools = await mcpService.listTools();
    } catch (e) {
      logger.warn('Failed to list MCP tools', { error: e.message });
    }

    const toolsDesc = mcpTools.length > 0
      ? `\n\nAvailable Tools:\n${mcpTools.map(t => `- ${t.name}: ${t.description} (Schema: ${JSON.stringify(t.inputSchema)})`).join('\n')}\n\nTo call a tool, set status="call_tool", action="${mcpTools[0].name}", observation=JSON_ARGUMENTS.`
      : '';

    let status = 'continue';
    let finalAnswer = null;
    let iteration = 0;

    while (status === 'continue' && iteration < maxIterations) {
      iteration += 1;

      const historyText = iterations
        .map((it, idx) => `# Step ${idx + 1}\nThought: ${it.thought}\nAction: ${it.action}\nObservation: ${it.observation}`)
        .join('\n\n');

      const prompt = overridePrompt
        ? baseSystem
        : `${baseSystem}${toolsDesc}\n\nTask: ${taskInput}\nContext:\n${ctxText || 'None'}\nHistory:\n${historyText || 'None'}\n\nReturn next JSON step. If done, set status to final_answer and include observation as the answer. If clarification is needed, set status to needs_clarification and include questions in observation.`;

      try {
        let response = await callOllama(model, prompt, FALLBACK_PLANNER_MODEL, providerPayload, { formatJson: Boolean(overridePrompt) });
        let parsed = safeJsonParse(response);

        if (!parsed) {
          const m = String(response).match(/```json\s*([\s\S]*?)\s*```/i) || String(response).match(/{[\s\S]*}/);
          if (m) parsed = safeJsonParse(m[1] || m[0]);
        }

        if (!parsed) {
          const retryPrompt = `${baseSystem}\n\nYour previous response was invalid JSON. Respond with ONLY valid JSON matching keys: thought, action, observation, status (continue|final_answer|needs_clarification|error). Task: ${taskInput}\nContext:\n${ctxText || 'None'}\nHistory:\n${historyText || 'None'}`;
          response = await callOllama(model, retryPrompt, FALLBACK_PLANNER_MODEL, providerPayload, { formatJson: true });
          parsed = safeJsonParse(response) || safeJsonParse((response.match(/```json\s*([\s\S]*?)\s*```/i) || response.match(/{[\s\S]*}/))?.[1] || (response.match(/```json\s*([\s\S]*?)\s*```/i) || response.match(/{[\s\S]*}/))?.[0]);
        }

        const thought = parsed?.thought || 'N/A';
        const action = parsed?.action || 'unknown';
        const observation = parsed?.observation || response;
        status = parsed?.status || 'continue';
        const nextTasks = Array.isArray(parsed?.nextTasks) ? parsed.nextTasks : [];

        const step = { thought, action, observation, status, nextTasks, ts: Date.now() };

        if (status === 'call_tool') {
          try {
            // For tool calls, 'observation' field in JSON response should hold the arguments
            const toolArgs = typeof observation === 'string' ? safeJsonParse(observation) || {} : observation;
            logger.info(`Calling MCP tool: ${action}`, toolArgs);

            const toolResult = await mcpService.callTool(action, toolArgs);

            // Update step with actual result
            step.observation = JSON.stringify(toolResult);
            step.status = 'continue'; // Continue loop after tool execution
            logger.info(`Tool result:`, toolResult);
          } catch (toolErr) {
            step.observation = `Tool execution failed: ${toolErr.message}`;
            step.status = 'error';
          }
        }

        iterations.push(step);
        events.push({ event: action, data: step.observation, ts: step.ts });

        if (status === 'final_answer') {
          finalAnswer = observation;
          break;
        }
        if (status === 'needs_clarification' || status === 'error') {
          break;
        }
      } catch (err) {
        const errorMsg = err?.message || String(err);
        iterations.push({ thought: 'Error', action: 'error', observation: errorMsg, status: 'error', ts: Date.now() });
        events.push({ event: 'error', data: { message: errorMsg }, ts: Date.now() });
        status = 'error';
        logger.error('Execute loop error', { message: errorMsg });
        break;
      }
    }

    res.json({
      task,
      autonomous,
      status,
      finalAnswer,
      iterations,
      events,
      nextTasks: iterations.length > 0 ? (iterations[iterations.length - 1].nextTasks || []) : [],
      context: { ragContext, ragError },
      modelTried: model,
      fallbackTried: FALLBACK_PLANNER_MODEL,
      provider: providerPayload.provider
    });
  } catch (error) {
    logger.error('Execute endpoint failure', { error: error?.message || String(error) });
    res.status(500).json({ error: error?.message || 'execute failed' });
  }
});

// Delegation + orchestration endpoint (Server-Sent Events)
app.post('/delegate', async (req, res) => {
  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => sendEvent('ping', { t: Date.now() }), 15000);

  try {
    const { task, agents = [], context = {} } = req.body || {};
    if (!task || typeof task !== 'string') {
      sendEvent('error', { message: 'task is required' });
      res.end();
      clearInterval(heartbeat);
      return;
    }

    if (!Array.isArray(agents) || agents.length === 0) {
      sendEvent('error', { message: 'agents array is required' });
      res.end();
      clearInterval(heartbeat);
      return;
    }

    // Optional RAG context
    let ragContext = [];
    let ragError = null;
    if (context?.useRAG) {
      try {
        const response = await fetch(`${RAG_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: task, k: context.k || 8 })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`RAG search failed ${response.status}: ${text}`);
        }
        const data = await response.json();
        ragContext = data.results || [];
      } catch (err) {
        ragError = err?.message || String(err);
        logger.warn('Delegation RAG fetch error', { detail: ragError });
      }
    }

    sendEvent('start', { task, agentCount: agents.length, ragError });

    const ctxText = ragContext
      .map((c, idx) => `# Context ${idx + 1}\n${c.text || c.content || ''}`)
      .join('\n\n');

    const plannerModel = await selectModel(req.body.model, PLANNER_MODEL);
    const providerPayload = {
      provider: req.body.provider,
      apiKey: req.body.apiKey,
      endpoint: req.body.endpoint
    };

    // High-level delegation plan
    const planPrompt = `You are a master coordinator. Task: ${task}\n\nAgents:\n${agents
      .map((a, idx) => `- ${idx + 1}. ${a.name || a.id || 'agent'} | capabilities: ${(a.capabilities || []).join(', ')}`)
      .join('\n')}\n\nContext:\n${ctxText}\n\nProduce a concise delegation plan with numbered steps, each assigned to an agent by name.`;

    let delegationPlan = '';
    try {
      delegationPlan = await callOllama(plannerModel, planPrompt, FALLBACK_PLANNER_MODEL, providerPayload);
      sendEvent('plan', { plan: delegationPlan, model: plannerModel, fallback: FALLBACK_PLANNER_MODEL, provider: providerPayload.provider });
    } catch (err) {
      logger.error('Delegation plan generation failed', { error: err?.message || String(err) });
      sendEvent('error', { message: 'Failed to generate delegation plan', detail: err?.message || String(err) });
      res.end();
      clearInterval(heartbeat);
      return;
    }

    // Execute per-agent subtasks in parallel
    const agentPromises = agents.map(async (agent) => {
      const capabilityText = Array.isArray(agent.capabilities) ? agent.capabilities.join(', ') : '';
      const agentPrompt = `You are agent ${agent.name || agent.id}. Task: ${task}\nCapabilities: ${capabilityText}\nDelegation plan:\n${delegationPlan}\n\nReturn a short JSON with fields: summary, next_steps (array), risks (array).`;
      try {
        const result = await callOllama(plannerModel, agentPrompt, FALLBACK_PLANNER_MODEL, providerPayload);
        sendEvent('agent_result', {
          agent: agent.name || agent.id,
          result,
          model: plannerModel,
          fallback: FALLBACK_PLANNER_MODEL,
          provider: providerPayload.provider
        });
      } catch (err) {
        logger.error('Agent delegation error', { agent: agent.name || agent.id, error: err?.message || String(err) });
        sendEvent('agent_error', {
          agent: agent.name || agent.id,
          message: err?.message || String(err)
        });
      }
    });

    await Promise.all(agentPromises);
    sendEvent('done', { completed: true });
    res.end();
  } catch (error) {
    logger.error('Delegate error', { error: error?.message || String(error) });
    sendEvent('error', { message: 'Delegation failed', detail: error?.message || String(error) });
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info('Agent service running', { port: PORT });
  logger.info('RAG service URL', { url: RAG_URL });
  logger.info('Planner model configured', { model: PLANNER_MODEL });
  logger.info('Coder model configured', { model: CODER_MODEL });
});