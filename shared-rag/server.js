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
const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const embedModel = process.env.EMBED_MODEL || 'nomic-embed-text';

let index = []; // { path, snippet, offset, embedding?: number[] }

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
  const { query, k = 8 } = req.body ?? {};
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
  res.json({ results: scored });
});

app.post('/reindex', async (_req, res) => {
  const count = await reindex();
  res.json({ indexed: count });
});

const port = process.env.PORT || 7777;
app.listen(port, () => {
  console.log(`shared-rag listening on ${port}, root=${workspaceRoot}`);
});
