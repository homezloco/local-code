const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const Suggestion = require('../models/Suggestion');
const Task = require('../models/Task');

const router = express.Router();

// Simple in-memory rate limiter (per agent)
const BURST_LIMIT = 5; // max within BURST_WINDOW_MS
const BURST_WINDOW_MS = 10_000;
const MINUTE_LIMIT = 30; // max within MINUTE_WINDOW_MS
const MINUTE_WINDOW_MS = 60_000;
const DEBOUNCE_MS = 5_000; // delay before surfacing

const agentHits = new Map();

function recordAndCheckRate(agentName) {
  const now = Date.now();
  const hits = agentHits.get(agentName) || [];
  const windowed = hits.filter((t) => now - t < MINUTE_WINDOW_MS);
  const burst = windowed.filter((t) => now - t < BURST_WINDOW_MS);
  if (burst.length >= BURST_LIMIT || windowed.length >= MINUTE_LIMIT) {
    return false;
  }
  windowed.push(now);
  agentHits.set(agentName, windowed);
  return true;
}

function makeFingerprint({ title, body, agentName }) {
  return crypto.createHash('sha256').update(`${title}::${body}::${agentName}`).digest('hex');
}

// Simple tokenization and similarity (placeholder until embeddings plugged)
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(aTokens, bTokens) {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const intersection = [...aSet].filter((t) => bSet.has(t));
  const union = new Set([...aSet, ...bSet]);
  if (union.size === 0) return 0;
  return intersection.length / union.size;
}

function scoreSuggestion(suggestion) {
  const confidence = suggestion.confidence ?? 0.5;
  const trust = suggestion.metadata?.trustWeight ?? 1;
  const createdAt = suggestion.createdAt ? new Date(suggestion.createdAt).getTime() : Date.now();
  const ageMinutes = Math.max(0, (Date.now() - createdAt) / 60000);
  const recencyFactor = Math.max(0.5, Math.exp(-ageMinutes / 60));
  const raw = confidence * trust * recencyFactor;
  return Math.max(0, Math.min(1, raw));
}

function clusterSuggestions(suggestions) {
  const clusters = [];
  const SIM_THRESHOLD = 0.5;

  suggestions.forEach((sugg) => {
    const tokens = tokenize(`${sugg.title} ${sugg.body}`);
    const tags = Array.isArray(sugg.tags) ? sugg.tags : [];
    let assigned = false;
    for (const cluster of clusters) {
      const sim = jaccardSimilarity(tokens, cluster.tokens);
      const tagOverlap = tags.some((t) => cluster.tags.has(t));
      if (sim >= SIM_THRESHOLD || tagOverlap) {
        cluster.items.push(sugg);
        cluster.tokens = [...new Set([...cluster.tokens, ...tokens])];
        tags.forEach((t) => cluster.tags.add(t));
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({
        id: sugg.clusterId || `cluster-${clusters.length + 1}`,
        tokens,
        tags: new Set(tags),
        items: [sugg]
      });
    }
  });

  return clusters.map((c) => {
    const scored = c.items.map((item) => ({ item, score: scoreSuggestion(item) }));
    scored.sort((a, b) => (b.score || 0) - (a.score || 0));
    const top = scored[0];
    const agents = [...new Set(c.items.map((i) => i.agentName))];
    const summary = top ? top.item.title : 'Cluster';
    const clusterScore = scored.reduce((acc, cur) => acc + (cur.score || 0), 0) / Math.max(1, scored.length);
    return {
      id: c.id,
      summary,
      score: Number(clusterScore.toFixed(3)),
      agents,
      tags: [...c.tags],
      topRepresentative: top?.item,
      suggestions: scored.map((s) => ({
        id: s.item.id,
        title: s.item.title,
        body: s.item.body,
        agentName: s.item.agentName,
        confidence: s.item.confidence,
        score: Number((s.score || 0).toFixed(3)),
        status: s.item.status,
        createdAt: s.item.createdAt,
        metadata: s.item.metadata
      }))
    };
  });
}

// Ingest a suggestion
router.post('/ingest', async (req, res) => {
  try {
    const { title, body, agentName, confidence, metadata, tags } = req.body || {};
    if (!title || !body || !agentName) {
      return res.status(400).json({ error: 'title, body, and agentName are required' });
    }

    if (!recordAndCheckRate(agentName)) {
      return res.status(429).json({ error: 'Rate limit exceeded for agent' });
    }

    const fingerprint = makeFingerprint({ title, body, agentName });
    const existing = await Suggestion.findOne({ where: { fingerprint } });
    if (existing) {
      return res.status(200).json(existing);
    }

    const availableAt = new Date(Date.now() + DEBOUNCE_MS);
    const suggestion = await Suggestion.create({
      title,
      body,
      agentName,
      confidence: confidence ?? null,
      fingerprint,
      tags: Array.isArray(tags) ? tags : null,
      availableAt,
      metadata: metadata ?? null,
      status: 'new'
    });
    return res.status(201).json(suggestion);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Summary endpoint: clusters of available suggestions (status=new by default)
router.get('/summary', async (req, res) => {
  try {
    const { status = 'new', min_score } = req.query;
    const where = status ? { status } : {};
    where.availableAt = { [Op.lte]: new Date() };
    let suggestions = [];
    try {
      suggestions = await Suggestion.findAll({ where, order: [['createdAt', 'DESC']] });
    } catch (err) {
      // If table is missing (fresh DB), return empty instead of 500
      if (err?.message?.includes('no such table')) {
        return res.json({ clusters: [] });
      }
      throw err;
    }
    const clusters = clusterSuggestions(suggestions);
    const filtered = typeof min_score !== 'undefined'
      ? clusters.filter((c) => c.score >= Number(min_score))
      : clusters;
    return res.json({ clusters: filtered });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// List suggestions (optionally by status)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    where.availableAt = { [Op.lte]: new Date() };
    const suggestions = await Suggestion.findAll({ where, order: [['createdAt', 'DESC']] });
    return res.json(suggestions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Approve -> create task and mark suggestion
router.post('/:id/approve', async (req, res) => {
  try {
    const suggestion = await Suggestion.findByPk(req.params.id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    const task = await Task.create({
      title: suggestion.title,
      description: suggestion.body,
      priority: 'medium',
      metadata: { sourceSuggestionId: suggestion.id, agentName: suggestion.agentName }
    });
    await suggestion.update({ status: 'approved', metadata: { ...(suggestion.metadata || {}), taskId: task.id } });
    return res.json({ suggestion, task });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Reject
router.post('/:id/reject', async (req, res) => {
  try {
    const suggestion = await Suggestion.findByPk(req.params.id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    await suggestion.update({ status: 'rejected' });
    return res.json(suggestion);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
