const fetch = require('node-fetch');
const Task = require('../models/Task');
const Agent = require('../models/Agent');
const TaskDelegation = require('../models/TaskDelegation');
const logger = require('../config/logger');

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:7788';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || 'gemma3:1b';
const CLASSIFIER_TIMEOUT_MS = Number(process.env.CLASSIFIER_TIMEOUT_MS || 30000);

const AGENT_CAPABILITIES = {
  'email-agent': {
    keywords: ['email', 'mail', 'send', 'inbox', 'reply', 'forward', 'newsletter', 'smtp', 'meeting invite', 'calendar invite'],
    description: 'Handles email operations: sending, reading, drafting, scheduling meetings via email'
  },
  'coding-agent': {
    keywords: ['code', 'program', 'debug', 'fix bug', 'implement', 'refactor', 'test', 'deploy', 'api', 'database', 'frontend', 'backend', 'script', 'function', 'class', 'module'],
    description: 'Handles coding tasks: writing code, debugging, code review, deployment, testing'
  },
  'investment-agent': {
    keywords: ['invest', 'stock', 'portfolio', 'market', 'trade', 'crypto', 'dividend', 'roi', 'financial', 'asset', 'fund', 'etf', 'bond', 'analysis', 'valuation'],
    description: 'Handles investment tasks: research, analysis, portfolio management, market monitoring'
  },
  'social-media-agent': {
    keywords: ['social', 'post', 'tweet', 'instagram', 'linkedin', 'facebook', 'content', 'engagement', 'followers', 'hashtag', 'schedule post', 'analytics', 'brand'],
    description: 'Handles social media: content creation, scheduling, engagement tracking, analytics'
  },
  'time-management-agent': {
    keywords: ['schedule', 'calendar', 'reminder', 'deadline', 'priority', 'time block', 'meeting', 'appointment', 'todo', 'plan day', 'weekly review', 'focus'],
    description: 'Handles time management: scheduling, reminders, prioritization, calendar management'
  }
};

/**
 * Classify task intent using keyword matching as primary, LLM as fallback.
 * Returns { agentName, intent, confidence }
 */
async function classifyTask(title, description) {
  const text = `${title} ${description || ''}`.toLowerCase();

  // Phase 1: keyword scoring
  const scores = {};
  for (const [agentName, config] of Object.entries(AGENT_CAPABILITIES)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (text.includes(keyword)) {
        score += keyword.includes(' ') ? 2 : 1; // multi-word matches score higher
      }
    }
    if (score > 0) scores[agentName] = score;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0 && sorted[0][1] >= 2) {
    const maxScore = sorted[0][1];
    const totalKeywords = Object.values(AGENT_CAPABILITIES)
      .reduce((sum, c) => sum + c.keywords.length, 0);
    const confidence = Math.min(0.95, 0.5 + (maxScore / totalKeywords) * 5);
    return {
      agentName: sorted[0][0],
      intent: `keyword-match (score: ${maxScore})`,
      confidence: Math.round(confidence * 100) / 100
    };
  }

  // Phase 2: LLM classification fallback
  try {
    const agentList = Object.entries(AGENT_CAPABILITIES)
      .map(([name, config]) => `- ${name}: ${config.description}`)
      .join('\n');

    const prompt = `You are a task router. Given a task, respond with ONLY the agent name that should handle it.

Available agents:
${agentList}
- general: For tasks that don't clearly fit any specialized agent

Task title: ${title}
Task description: ${description || 'No description'}

Respond with ONLY the agent name (e.g., "coding-agent"). Nothing else.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

    try {
      const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: CLASSIFIER_MODEL, prompt, stream: false }),
        signal: controller.signal
      });

      if (resp.ok) {
        const data = await resp.json();
        const response = (data.response || '').trim().toLowerCase().replace(/[^a-z-]/g, '');
        const validAgents = [...Object.keys(AGENT_CAPABILITIES), 'general'];
        const matched = validAgents.find((a) => response.includes(a.replace('-agent', '')) || response === a);
        if (matched) {
          return { agentName: matched, intent: 'llm-classified', confidence: 0.7 };
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn(`LLM classification failed, falling back to general: ${err?.message || err}`);
  }

  // Phase 3: default to general/coding-agent as most versatile
  return { agentName: 'coding-agent', intent: 'default-fallback', confidence: 0.3 };
}

/**
 * Delegate a task to the appropriate agent.
 * Creates a TaskDelegation record and updates the task status.
 */
async function delegateTask(taskId, options = {}) {
  const task = await Task.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  // Classify which agent should handle this
  const forceAgent = options.agentName;
  const classification = forceAgent
    ? { agentName: forceAgent, intent: 'manual-assignment', confidence: 1.0 }
    : await classifyTask(task.title, task.description);

  // Verify agent exists in DB (or create a placeholder)
  let agent = await Agent.findOne({ where: { name: classification.agentName } });
  if (!agent && classification.agentName !== 'general') {
    // Auto-register the agent if it doesn't exist yet
    const capConfig = AGENT_CAPABILITIES[classification.agentName];
    agent = await Agent.create({
      name: classification.agentName,
      displayName: classification.agentName
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      description: capConfig?.description || `Specialized ${classification.agentName} agent`,
      capabilities: capConfig?.keywords || [],
      models: [CLASSIFIER_MODEL],
      endpoints: { delegate: '/tasks/delegate', status: '/agents/status' }
    });
    logger.info(`Auto-registered agent: ${classification.agentName}`);
  }

  // Create delegation record
  const delegation = await TaskDelegation.create({
    taskId: task.id,
    agentName: classification.agentName,
    status: 'queued',
    intent: classification.intent,
    confidence: classification.confidence,
    input: {
      title: task.title,
      description: task.description,
      priority: task.priority,
      metadata: task.metadata
    },
    model: options.model || CLASSIFIER_MODEL,
    provider: options.provider || 'ollama'
  });

  // Update task status
  await task.update({
    status: 'delegated',
    assignedTo: classification.agentName
  });

  logger.info(`Task ${taskId} delegated to ${classification.agentName} (confidence: ${classification.confidence})`);

  // Execute asynchronously (don't await — let it run in background)
  executeDelegate(delegation.id, task, classification, options).catch((err) => {
    logger.error(`Delegation execution failed for ${delegation.id}: ${err?.message || err}`);
  });

  return {
    delegationId: delegation.id,
    taskId: task.id,
    agentName: classification.agentName,
    intent: classification.intent,
    confidence: classification.confidence,
    status: 'queued'
  };
}

/**
 * Execute the delegated task via the agent-service.
 */
async function executeDelegate(delegationId, task, classification, options = {}) {
  const delegation = await TaskDelegation.findByPk(delegationId);
  if (!delegation) return;

  try {
    await delegation.update({ status: 'running', startedAt: new Date() });
    await task.update({ status: 'in_progress' });

    // Build the prompt based on agent type
    const agentPrompt = buildAgentPrompt(classification.agentName, task);

    // Call the agent-service /plan endpoint
    const resp = await fetch(`${AGENT_SERVICE_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: agentPrompt,
        context: { useRAG: true, k: 8 },
        model: options.model || CLASSIFIER_MODEL,
        provider: options.provider,
        apiKey: options.apiKey,
        endpoint: options.endpoint
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Agent service error ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    const result = {
      plan: data.plan || data.code || JSON.stringify(data),
      model: data.modelTried,
      fallback: data.fallbackTried,
      provider: data.provider,
      context: data.context
    };

    // Determine if task needs review or is auto-completable
    const needsReview = classification.confidence < 0.7 || task.priority === 'urgent';
    const finalStatus = needsReview ? 'review' : 'completed';

    await delegation.update({
      status: finalStatus,
      result,
      completedAt: new Date()
    });

    await task.update({
      status: finalStatus,
      metadata: {
        ...(task.metadata || {}),
        lastDelegation: {
          delegationId,
          agentName: classification.agentName,
          result: result.plan || '',
          completedAt: new Date().toISOString()
        }
      }
    });

    logger.info(`Delegation ${delegationId} completed with status: ${finalStatus}`);
  } catch (err) {
    const errorMsg = err?.message || String(err);
    logger.error(`Delegation ${delegationId} failed: ${errorMsg}`);

    await delegation.update({
      status: 'failed',
      error: errorMsg,
      completedAt: new Date()
    });

    await task.update({
      status: 'failed',
      metadata: {
        ...(task.metadata || {}),
        lastError: { delegationId, error: errorMsg, at: new Date().toISOString() }
      }
    });
  }
}

/**
 * Build a specialized prompt based on the agent type.
 */
function buildAgentPrompt(agentName, task) {
  const base = `Task: ${task.title}\nDescription: ${task.description || 'No description'}\nPriority: ${task.priority}`;

  switch (agentName) {
    case 'email-agent':
      return `You are an email assistant. ${base}\n\nAnalyze this task and provide:\n1. Draft email content (if sending)\n2. Suggested recipients\n3. Subject line\n4. Any follow-up actions needed`;

    case 'coding-agent':
      return `You are a senior software engineer. ${base}\n\nAnalyze this task and provide your response as a JSON object with this structure:\n{"summary":"brief description of what you did","files":[{"path":"relative/path/to/file.ext","action":"create|modify|delete","language":"javascript|typescript|python|etc","content":"the full file content or code changes","description":"what this file change does"}],"testStrategy":"how to verify these changes","risks":"potential issues"}\n\nIMPORTANT: Respond ONLY with the JSON object. Use real file paths relative to the project root. Provide complete, runnable code.`;

    case 'investment-agent':
      return `You are a financial analyst and investment advisor. ${base}\n\nAnalyze this task and provide:\n1. Market analysis relevant to the task\n2. Risk assessment\n3. Recommended actions with rationale\n4. Key metrics to monitor\n5. Timeline for execution`;

    case 'social-media-agent':
      return `You are a social media strategist. ${base}\n\nAnalyze this task and provide:\n1. Content strategy and messaging\n2. Platform-specific recommendations\n3. Optimal posting schedule\n4. Engagement tactics\n5. Metrics to track`;

    case 'time-management-agent':
      return `You are a productivity and time management expert. ${base}\n\nAnalyze this task and provide:\n1. Priority assessment\n2. Time estimation\n3. Suggested schedule/time blocks\n4. Dependencies and prerequisites\n5. Reminders and deadlines to set`;

    default:
      return `You are a helpful assistant. ${base}\n\nAnalyze this task and provide a detailed plan with actionable steps.`;
  }
}

/**
 * Get delegation history for a task.
 */
async function getDelegationHistory(taskId) {
  return TaskDelegation.findAll({
    where: { taskId },
    order: [['createdAt', 'DESC']]
  });
}

/**
 * Get all active delegations.
 */
async function getActiveDelegations() {
  return TaskDelegation.findAll({
    where: { status: ['queued', 'running'] },
    order: [['createdAt', 'ASC']]
  });
}

/**
 * Approve a delegation in review status.
 */
async function approveDelegation(delegationId) {
  const delegation = await TaskDelegation.findByPk(delegationId);
  if (!delegation) throw new Error(`Delegation ${delegationId} not found`);
  if (delegation.status !== 'review') throw new Error(`Delegation ${delegationId} is not in review status`);

  await delegation.update({ status: 'completed', completedAt: new Date() });

  const task = await Task.findByPk(delegation.taskId);
  if (task) {
    await task.update({ status: 'completed' });
  }

  return delegation;
}

/**
 * Reject a delegation and re-queue or fail the task.
 */
async function rejectDelegation(delegationId, reason) {
  const delegation = await TaskDelegation.findByPk(delegationId);
  if (!delegation) throw new Error(`Delegation ${delegationId} not found`);

  await delegation.update({
    status: 'failed',
    error: reason || 'Rejected by user',
    completedAt: new Date()
  });

  const task = await Task.findByPk(delegation.taskId);
  if (task) {
    await task.update({ status: 'pending', assignedTo: null });
  }

  return delegation;
}

module.exports = {
  classifyTask,
  delegateTask,
  getDelegationHistory,
  getActiveDelegations,
  approveDelegation,
  rejectDelegation,
  AGENT_CAPABILITIES
};
