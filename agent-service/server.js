import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
const PLANNER_MODEL = process.env.PLANNER_MODEL || 'codellama:instruct';
const CODER_MODEL = process.env.CODER_MODEL || 'qwen2.5-coder:14b';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const FALLBACK_PLANNER_MODEL = process.env.FALLBACK_PLANNER_MODEL || null;
const FALLBACK_CODER_MODEL = process.env.FALLBACK_CODER_MODEL || null;

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
    console.error('Ollama tags fetch error:', err?.message || err);
    return cachedModels || [];
  }
}

async function selectModel(requested, fallbackDefault) {
  const model = requested || fallbackDefault;
  // Only validate Ollama models; for external providers assume caller knows.
  const models = await listOllamaModels();
  if (models.includes(model)) return model;
  console.warn(`Model ${model} not found in Ollama tags; falling back to ${fallbackDefault}`);
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

const callOllama = async (model, prompt, fallbackModel = null, providerPayload = {}, { stream = false } = {}) => {
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
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: m, prompt, stream: Boolean(stream) }),
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
    console.error('List models error:', error);
    res.status(502).json({ error: 'Failed to list models', detail: error?.message || String(error) });
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
        console.error('RAG fetch error, continuing without context:', ragError);
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
    console.error('Plan error:', error);
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

    // Get context from RAG if needed
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
    console.error('Codegen error:', error);
    res.status(502).json({ error: 'Failed to generate code', detail: error?.message || String(error) });
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
        console.error('Delegation RAG fetch error:', ragError);
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
    console.error('Delegate error:', error);
    sendEvent('error', { message: 'Delegation failed', detail: error?.message || String(error) });
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Agent service running on port ${PORT}`);
  console.log(`RAG service URL: ${RAG_URL}`);
  console.log(`Planner model: ${PLANNER_MODEL}`);
  console.log(`Coder model: ${CODER_MODEL}`);
});