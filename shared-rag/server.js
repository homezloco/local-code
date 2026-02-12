import express from 'express';
import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const workspaceRoot = process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), '..');
const includeGlobs = (process.env.RAG_INCLUDE || 'src/**,app/**,pages/**,components/**,server/**').split(',');
const excludeGlobs = (process.env.RAG_EXCLUDE || 'node_modules/**,.git/**,.next/**,.nuxt/**,dist/**,build/**,coverage/**').split(',');
const chunkSize = Number(process.env.CHUNK_SIZE || 1200);
const maxFileSize = Number(process.env.MAX_FILE_SIZE || 500_000);

const requiredEnv = ['OLLAMA_URL', 'EMBED_MODEL'];
const missingEnv = requiredEnv.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`Missing required env vars: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const ollamaUrl = process.env.OLLAMA_URL;
const embedModel = process.env.EMBED_MODEL;

let index = []; // { path, snippet, offset, embedding?: number[] }

function ensureString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({ snippet: text.slice(i, i + chunkSize), offset: i });
  }
  return chunks;
}

async function embedText(text) {
  try {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embedModel, prompt: text }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`embed status ${res.status}: ${t}`);
    }
    const data = await res.json();
    return data.embedding;
  } catch (err) {
    console.warn(`embed fallback: ${(err && err.message) || err}`);
    return undefined;
  }
}

async function reindex() {
  const patterns = includeGlobs.map((g) => path.join(workspaceRoot, g));
  const entries = await fg(patterns, { ignore: excludeGlobs, onlyFiles: true, dot: false });
  const chunks = [];
  for (const filePath of entries) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > maxFileSize) continue;
      const content = await fs.readFile(filePath, 'utf8');
      for (let i = 0; i < content.length; i += chunkSize) {
        const snippet = content.slice(i, i + chunkSize);
        const embedding = await embedText(snippet);
        chunks.push({ path: filePath, snippet, offset: i, embedding });
      }
    } catch (err) {
      // skip unreadable files silently
      console.warn(`skip ${filePath}: ${(err && err.message) || err}`);
    }
  }
  index = chunks;
  return chunks.length;
}

function keywordScore(query, text) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (lower.includes(t)) s += 1;
  }
  return s;
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

app.post('/search', async (req, res) => {
  const { query, k = 8, useWebFallback = true } = req.body ?? {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!index.length) {
    await reindex();
  }
  let queryEmbedding;
  try {
    queryEmbedding = await embedText(query);
  } catch (err) {
    console.warn(`query embed fallback: ${(err && err.message) || err}`);
  }
  const scored = index
    .map((c) => {
      let s = 0;
      if (queryEmbedding && c.embedding) {
        s = cosine(queryEmbedding, c.embedding);
      } else {
        s = keywordScore(query, c.snippet);
      }
      return { ...c, _score: s };
    })
    .filter((c) => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, k)
    .map(({ _score, ...rest }) => rest);

  // Optional web search fallback
  if (scored.length === 0 && useWebFallback) {
    try {
      const webResp = await fetch('https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json', {
        method: 'GET',
        headers: { 'User-Agent': 'local-agentic-workspace' }
      });
      if (webResp.ok) {
        const data = await webResp.json();
        const abstracts = (data?.RelatedTopics || [])
          .map((t) => t.Text)
          .filter(Boolean)
          .slice(0, k)
          .map((text, idx) => ({ path: `web:${idx}`, snippet: text, offset: 0 }));
        return res.json({ results: abstracts, source: 'web_fallback' });
      }
    } catch (err) {
      console.warn('web search fallback failed', err?.message || err);
    }
  }

  res.json({ results: scored, source: 'local' });
});

app.post('/reindex', async (_req, res) => {
  const count = await reindex();
  res.json({ indexed: count });
});

// Ingest raw text
app.post('/ingest/text', async (req, res) => {
  try {
    const text = ensureString(req.body?.text, 'text');
    const source = req.body?.source || 'text';
    const chunks = chunkText(text);
    for (const c of chunks) {
      const embedding = await embedText(c.snippet);
      index.push({ path: `text:${source}`, snippet: c.snippet, offset: c.offset, embedding });
    }
    res.json({ indexed: chunks.length });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'ingest failed' });
  }
});

// Ingest by URL (fetch content as text)
app.post('/ingest/url', async (req, res) => {
  try {
    const url = ensureString(req.body?.url, 'url');
    const response = await fetch(url, { headers: { 'User-Agent': 'local-agentic-workspace' } });
    if (!response.ok) {
      return res.status(502).json({ error: `Fetch failed ${response.status}` });
    }
    const text = await response.text();
    const chunks = chunkText(text);
    for (const c of chunks) {
      const embedding = await embedText(c.snippet);
      index.push({ path: `url:${url}`, snippet: c.snippet, offset: c.offset, embedding });
    }
    res.json({ indexed: chunks.length });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'ingest failed' });
  }
});

// Ingest file content (path relative to workspaceRoot)
app.post('/ingest/file', async (req, res) => {
  try {
    const relPath = ensureString(req.body?.path, 'path');
    const absPath = path.resolve(workspaceRoot, relPath);
    const stat = await fs.stat(absPath);
    if (stat.size > maxFileSize) {
      return res.status(400).json({ error: 'file too large' });
    }
    const content = await fs.readFile(absPath, 'utf8');
    const chunks = chunkText(content);
    for (const c of chunks) {
      const embedding = await embedText(c.snippet);
      index.push({ path: absPath, snippet: c.snippet, offset: c.offset, embedding });
    }
    res.json({ indexed: chunks.length, path: absPath });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'ingest failed' });
  }
});

app.get('/health', async (_req, res) => {
  const envStatus = {
    OLLAMA_URL: ollamaUrl,
    EMBED_MODEL: embedModel,
  };
  const response = {
    status: missingEnv.length ? 'degraded' : 'ok',
    missingEnv,
    indexSize: index.length,
    workspaceRoot,
    includeGlobs,
    excludeGlobs,
  };

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const ollamaResp = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(t);
    response.ollama = { status: ollamaResp.ok ? 'ok' : `status ${ollamaResp.status}` };
  } catch (err) {
    response.ollama = { status: 'error', detail: err?.message || String(err) };
    response.status = 'degraded';
  }

  res.status(response.status === 'ok' ? 200 : 503).json({ ...response, env: envStatus });
});

const port = process.env.PORT || 7777;
app.listen(port, () => {
  console.log(`shared-rag listening on ${port}, root=${workspaceRoot}`);
});
