import express from 'express';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 7788;
const RAG_URL = process.env.RAG_URL || 'http://127.0.0.1:7777';
const PLANNER_MODEL = process.env.PLANNER_MODEL || 'llama3.1:8b';
const CODER_MODEL = process.env.CODER_MODEL || 'qwen2.5-coder:14b';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const FALLBACK_PLANNER_MODEL = process.env.FALLBACK_PLANNER_MODEL || null;
const FALLBACK_CODER_MODEL = process.env.FALLBACK_CODER_MODEL || null;

const OLLAMA_RETRIES = Number(process.env.OLLAMA_RETRIES || 0);

const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);

const callOllama = async (model, prompt, fallbackModel = null, providerPayload = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  let lastErr;
  const modelsToTry = [model, ...(fallbackModel ? [fallbackModel] : [])];
  let attempt = 0;
  try {
    for (const m of modelsToTry) {
      attempt += 1;
      try {
        const url = providerPayload.endpoint || `${OLLAMA_URL}/api/generate`;
        const headers = { 'Content-Type': 'application/json' };
        if (providerPayload.apiKey) {
          headers['Authorization'] = `Bearer ${providerPayload.apiKey}`;
        }
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: m, prompt, stream: false }),
          signal: controller.signal
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Ollama error ${response.status} (${m}): ${text}`);
        }
        const data = await response.json();
        return data.response || '';
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

// Plan endpoint
app.post('/plan', async (req, res) => {
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
    const fullPrompt = `${prompt}\n\nContext:\n${ctxText}`;
    const model = req.body.model || PLANNER_MODEL;
    const providerPayload = {
      provider: req.body.provider,
      apiKey: req.body.apiKey,
      endpoint: req.body.endpoint
    };
    const plan = await callOllama(model, fullPrompt, FALLBACK_PLANNER_MODEL, providerPayload);
    res.json({ plan, context: ragContext, modelTried: model, fallbackTried: FALLBACK_PLANNER_MODEL, provider: providerPayload.provider });
  } catch (error) {
    console.error('Plan error:', error);
    res.status(502).json({ error: 'Failed to generate plan', detail: error?.message || String(error) });
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
    const model = req.body.model || CODER_MODEL;
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

// Start server
app.listen(PORT, () => {
  console.log(`Agent service running on port ${PORT}`);
  console.log(`RAG service URL: ${RAG_URL}`);
  console.log(`Planner model: ${PLANNER_MODEL}`);
  console.log(`Coder model: ${CODER_MODEL}`);
});