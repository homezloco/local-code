// Use a universal fetch shim to support Node versions without global fetch and ESM-only node-fetch
const fetch =
  globalThis.fetch ||
  ((...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args)));
const Task = require('../models/Task');
const Agent = require('../models/Agent');
const TaskDelegation = require('../models/TaskDelegation');
const logger = require('../config/logger');

const RAG_URL = process.env.RAG_URL || 'http://127.0.0.1:7777';
const MASTER_AGENT_URL = process.env.MASTER_AGENT_URL || 'http://127.0.0.1:3001';

/**
 * Fetch codebase context from shared-rag service.
 */
async function getCodebaseContext(query, k = 5) {
  try {
    const resp = await fetch(`${RAG_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, k })
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || []).map((r) => ({
      path: r.path,
      snippet: (r.snippet || r.text || '').substring(0, 500),
      offset: r.offset
    }));
  } catch (err) {
    logger.warn(`RAG search failed: ${err?.message || err}`);
    return [];
  }
}

/**
 * Fetch a web URL via the internal web fetch route.
 */
async function fetchWebContent(url) {
  try {
    const resp = await fetch(`${MASTER_AGENT_URL}/web/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, allowAll: true })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      status: data.status,
      body: (data.body || '').substring(0, 5000)
    };
  } catch (err) {
    logger.warn(`Web fetch failed for ${url}: ${err?.message || err}`);
    return null;
  }
}

/**
 * Get current tasks from the database.
 */
async function getCurrentTasks() {
  try {
    const tasks = await Task.findAll({ order: [['createdAt', 'DESC']], limit: 50 });
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: (t.description || '').substring(0, 200),
      status: t.status,
      priority: t.priority,
      assignedTo: t.assignedTo,
      createdAt: t.createdAt
    }));
  } catch (err) {
    logger.warn(`Failed to fetch tasks: ${err?.message || err}`);
    return [];
  }
}

/**
 * Get registered agents from the database.
 */
async function getAgents() {
  try {
    const agents = await Agent.findAll();
    return agents.map((a) => ({
      name: a.name,
      displayName: a.displayName,
      status: a.status,
      capabilities: a.capabilities
    }));
  } catch (err) {
    logger.warn(`Failed to fetch agents: ${err?.message || err}`);
    return [];
  }
}

/**
 * Get recent delegation history.
 */
async function getRecentDelegations(limit = 20) {
  try {
    const delegations = await TaskDelegation.findAll({
      order: [['createdAt', 'DESC']],
      limit
    });
    return delegations.map((d) => ({
      taskId: d.taskId,
      agentName: d.agentName,
      status: d.status,
      intent: d.intent,
      confidence: d.confidence,
      completedAt: d.completedAt
    }));
  } catch (err) {
    logger.warn(`Failed to fetch delegations: ${err?.message || err}`);
    return [];
  }
}

/**
 * Get which secrets/API keys are configured (not values).
 */
function getSecretsStatus() {
  const keys = [
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM',
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'OPENROUTER_API_KEY', 'CUSTOM_HTTP_API_KEY'
  ];
  const status = {};
  for (const key of keys) {
    status[key] = Boolean(process.env[key]);
  }
  return status;
}

/**
 * Get user profile/preferences.
 */
async function getUserProfile() {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    const profilePath = path.join(__dirname, '..', 'data', 'profile.json');
    const raw = await fs.readFile(profilePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

/**
 * Build a scoped context object for a specific agent.
 * Each agent gets data relevant to its domain.
 */
async function buildAgentContext(agentName) {
  const [tasks, agents, delegations, profile] = await Promise.all([
    getCurrentTasks(),
    getAgents(),
    getRecentDelegations(),
    getUserProfile()
  ]);

  const secretsStatus = getSecretsStatus();

  const base = {
    currentTasks: tasks,
    agents,
    recentDelegations: delegations,
    secretsStatus,
    profile: {
      plannerModel: profile.plannerModel,
      coderModel: profile.coderModel,
      ragK: profile.ragK
    },
    timestamp: new Date().toISOString()
  };

  switch (agentName) {
    case 'coding-agent': {
      const codeContext = await getCodebaseContext('TODO FIXME HACK refactor test coverage bug', 10);
      return { ...base, codebaseSnippets: codeContext, dataSource: 'rag-codebase-scan' };
    }
    case 'email-agent': {
      const hasEmail = secretsStatus.SMTP_HOST && secretsStatus.SMTP_USER;
      return { ...base, emailConfigured: hasEmail, dataSource: 'email-config-check' };
    }
    case 'investment-agent': {
      const marketData = await fetchWebContent('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd');
      return { ...base, marketSnapshot: marketData, dataSource: 'web-market-data' };
    }
    case 'social-media-agent': {
      return { ...base, dataSource: 'task-analysis' };
    }
    case 'time-management-agent': {
      const pendingTasks = tasks.filter((t) => t.status === 'pending');
      const overdueTasks = tasks.filter((t) => t.status === 'in_progress');
      return {
        ...base,
        pendingCount: pendingTasks.length,
        inProgressCount: overdueTasks.length,
        pendingTasks,
        dataSource: 'task-priority-analysis'
      };
    }
    default:
      return { ...base, dataSource: 'general' };
  }
}

module.exports = {
  getCodebaseContext,
  fetchWebContent,
  getCurrentTasks,
  getAgents,
  getRecentDelegations,
  getSecretsStatus,
  getUserProfile,
  buildAgentContext
};
