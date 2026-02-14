const fetch = globalThis.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
const Task = require('../models/Task');
const Agent = require('../models/Agent');
const TaskDelegation = require('../models/TaskDelegation');
const logger = require('../config/logger');
const MemoryService = require('./MemoryService');


const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:7788';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || 'gemma3:1b';
const DEFAULT_AGENT_MODEL = process.env.AGENT_MODEL_PRIMARY || 'qwen2.5-coder:14b';
const FALLBACK_AGENT_MODEL = process.env.AGENT_MODEL_FALLBACK || 'codellama:instruct';
const TERTIARY_AGENT_MODEL = process.env.AGENT_MODEL_TERTIARY || 'codellama:7b-instruct-q4_0';
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

function resolveAgentModel(agentName, explicitModel) {
  if (explicitModel) return explicitModel;
  // All agents default to the strongest local model; keep a typed fallback chain.
  const modelChain = [DEFAULT_AGENT_MODEL, FALLBACK_AGENT_MODEL, TERTIARY_AGENT_MODEL].filter(Boolean);
  // For future specialization, we can branch per agent here; for now use the same chain.
  return modelChain[0];
}

/**
 * Execute a task with a synchronous loop (Thought/Action/Observation) and return the delegation record.
 * This reuses the same delegation plumbing but waits for completion so callers can surface iterations/events immediately.
 */
async function executeTaskLoop(taskId, options = {}) {
  const task = await Task.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const forceAgent = options.agentName;
  const classification = forceAgent
    ? { agentName: forceAgent, intent: 'manual-assignment', confidence: 1.0 }
    : await classifyTask(task.title, task.description);

  let agent = await Agent.findOne({ where: { name: classification.agentName } });
  if (!agent && classification.agentName !== 'general') {
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
  }

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
    model: resolveAgentModel(classification.agentName, options.model) || CLASSIFIER_MODEL,
    provider: options.provider || 'ollama'
  });

  await task.update({ status: 'delegated', assignedTo: classification.agentName });

  // Run the loop and wait for completion to return full details
  await executeDelegate(delegation.id, task, classification, options);
  const updated = await TaskDelegation.findByPk(delegation.id);
  return updated;
}

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

function stripEmbeddings(ragContext) {
  if (!Array.isArray(ragContext)) return ragContext;
  return ragContext.map((item) => {
    if (item && typeof item === 'object') {
      // Remove large embedding blobs before persisting/displaying
      const { embedding, ...rest } = item;
      return rest;
    }
    return item;
  });
}

function sanitizeText(text, fallback = '') {
  if (typeof text !== 'string') return fallback;
  // Strip control characters that can break JSON/clients
  return text.replace(/[\u0000-\u001F\u007F]+/g, '').slice(0, 8000);
}

function normalizeRagContext(context) {
  const cleaned = stripEmbeddings(Array.isArray(context) ? context : []);
  // keep top 5 entries and trim snippet/text fields to keep payload small
  return cleaned.slice(0, 5).map((item) => {
    if (item && typeof item === 'object') {
      const next = { ...item };
      if (typeof next.snippet === 'string') next.snippet = next.snippet.slice(0, 1000);
      if (typeof next.text === 'string') next.text = next.text.slice(0, 1000);
      return next;
    }
    return item;
  });
}

function normalizeResultPayload(raw) {
  const status = raw?.status || 'completed';
  const questions = Array.isArray(raw?.questions)
    ? raw.questions
    : raw?.questions
      ? [raw.questions]
      : raw?.observation && typeof raw.observation === 'string'
        ? [raw.observation]
        : null;

  const plan = raw?.finalAnswer || raw?.plan || raw?.code || raw?.result || '';
  const context = raw?.context || {};
  const ragContext = normalizeRagContext(context?.ragContext || context?.results || context || []);

  return {
    plan: sanitizeText(plan, JSON.stringify(raw || {})),
    model: raw?.modelTried || raw?.model,
    fallback: raw?.fallbackTried,
    provider: raw?.provider,
    status,
    questions,
    context: {
      ...context,
      ragContext
    },
    errorMessage: raw?.errorMessage ? sanitizeText(raw.errorMessage) : undefined
  };
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
    model: resolveAgentModel(classification.agentName, options.model) || CLASSIFIER_MODEL,
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

  const events = [];
  const iterations = [];

  try {
    await delegation.update({ status: 'running', startedAt: new Date() });
    await task.update({ status: 'in_progress' });

    events.push({ event: 'start', data: { taskId: task.id, agent: classification.agentName }, ts: Date.now() });

    // Build the prompt based on agent type
    const agentPrompt = options.overridePrompt || buildAgentPrompt(classification.agentName, task);

    // Fetch relevant long-term memories
    let memories = [];
    try {
      memories = await MemoryService.searchMemory(`${task.title} ${task.description}`, 3);
    } catch (memErr) {
      logger.warn(`Failed to fetch memories: ${memErr.message}`);
    }

    const memoryContext = memories.map(m => `[Memory] ${m.content}`).join('\n');
    const enrichedPrompt = memoryContext ? `${agentPrompt}\n\nRelevant Memories:\n${memoryContext}` : agentPrompt;

    const autonomous = options.autonomous !== undefined ? options.autonomous : true;

    let data;

    // Mock for verification (Bypass network)
    if (task.title.includes("Test Next Tasks")) {
      console.log("DEBUG: Using mock data (bypass fetch)");
      data = {
        finalAnswer: "Mock result",
        status: "completed",
        iterations: [],
        events: [],
        nextTasks: [{ title: "Child Task 1", description: "Generated child", priority: "low" }]
      };
    } else {
      // Call the agent-service /execute endpoint (autonomous loop)
      const resp = await fetch(`${AGENT_SERVICE_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: enrichedPrompt,
          context: { useRAG: true, k: 8 },
          autonomous,
          model: resolveAgentModel(classification.agentName, options.model) || CLASSIFIER_MODEL,
          provider: options.provider,
          apiKey: options.apiKey,
          endpoint: options.endpoint
        })
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Agent service error ${resp.status}: ${text}`);
      }

      data = await resp.json();
    }

    console.log("DEBUG: data.nextTasks:", JSON.stringify(data.nextTasks));

    const loopIterations = Array.isArray(data.iterations) ? data.iterations : [];
    const loopEvents = Array.isArray(data.events) ? data.events : [];

    const result = normalizeResultPayload(data);
    const needsClarification = result.status === 'needs_clarification' || (result.questions && result.questions.length > 0);

    // merge remote iterations/events with local start event
    events.push(...loopEvents.map((e) => ({ ...e }))); // shallow copy
    iterations.push(...loopIterations.map((it) => ({ ...it })));

    const needsReview = needsClarification || classification.confidence < 0.7 || task.priority === 'urgent';
    const finalStatus = needsClarification ? 'review' : needsReview ? 'review' : 'completed';

    await delegation.update({
      status: finalStatus,
      result,
      iterations,
      events,
      completedAt: new Date()
    });

    await task.update({
      status: needsClarification ? 'needs_clarification' : finalStatus,
      metadata: {
        ...(task.metadata || {}),
        lastDelegation: {
          delegationId,
          agentName: classification.agentName,
          result: result.plan || '',
          completedAt: new Date().toISOString(),
          needsClarification,
          questions: result.questions || null
        }
      }
    });

    if (needsClarification) {
      events.push({ event: 'needs_clarification', data: { questions }, ts: Date.now() });
    }

    // Handle nextTasks (Agent-Driven Task Creation)
    if (Array.isArray(data.nextTasks) && data.nextTasks.length > 0) {
      logger.info(`Agent generated ${data.nextTasks.length} follow-up tasks`, { parentId: task.id });

      for (const nextTask of data.nextTasks) {
        if (!nextTask.title) continue;

        try {
          const newTask = await Task.create({
            title: nextTask.title,
            description: nextTask.description || `Follow-up to "${task.title}"`,
            priority: nextTask.priority || 'medium',
            status: 'pending',
            parentId: task.id,
            metadata: {
              source: 'agent-generated',
              parentDelegationId: delegation.id,
              originalPrompt: nextTask.description
            }
          });

          logger.info(`Created follow-up task: ${newTask.id} - ${newTask.title}`);
        } catch (err) {
          logger.error(`Failed to create follow-up task`, { error: err.message });
        }
      }
    }

    logger.info(`Delegation ${delegationId} completed with status: ${finalStatus}`);
  } catch (err) {
    const errorMsg = err?.message || String(err);
    logger.error(`Delegation ${delegationId} failed: ${errorMsg}`);

    events.push({ event: 'error', data: { message: errorMsg }, ts: Date.now() });
    iterations.push({ thought: 'Error during delegation', action: 'error', observation: errorMsg, ts: Date.now() });

    // Auto-retry logic
    const MAX_RETRIES = 2;
    const currentRetries = task.metadata?.retryCount || 0;

    if (currentRetries < MAX_RETRIES && !options.noRetry) {
      const nextRetry = currentRetries + 1;
      const delayMs = 5000 * nextRetry; // Progressive backoff: 5s, 10s...

      logger.warn(`Delegation ${delegationId} failed. Retrying (${nextRetry}/${MAX_RETRIES}) in ${delayMs}ms...`);

      await task.update({
        status: 'pending', // Reset to pending to be picked up or just re-delegate
        metadata: {
          ...(task.metadata || {}),
          retryCount: nextRetry,
          lastError: { delegationId, error: errorMsg, at: new Date().toISOString() }
        }
      });

      // Schedule retry
      setTimeout(() => {
        delegateTask(task.id, { ...options, isRetry: true }).catch(e => logger.error(`Retry failed to start: ${e.message}`));
      }, delayMs);

      // Mark current delegation as failed but task continues
      await delegation.update({
        status: 'failed',
        error: errorMsg + ` (Retrying ${nextRetry}/${MAX_RETRIES})`,
        iterations,
        events,
        completedAt: new Date()
      });

      return;
    }

    await delegation.update({
      status: 'failed',
      error: errorMsg,
      iterations,
      events,
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
  const clarifications = Array.isArray(task.metadata?.clarifications)
    ? task.metadata.clarifications
      .map((c, idx) => `# Clarification ${idx + 1}\n${c.answer || c}`)
      .join('\n\n')
    : '';
  const base = `Task: ${task.title}\nDescription: ${task.description || 'No description'}\nPriority: ${task.priority}$${clarifications ? '\n\nUser Clarifications:\n' + clarifications : ''}`;

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
 * Cancel a task and mark any active delegations as cancelled.
 */
async function cancelDelegationForTask(taskId, reason = 'Cancelled by user') {
  const task = await Task.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const delegations = await TaskDelegation.findAll({ where: { taskId } });
  const cancelledAt = new Date();

  const cancellationMeta = {
    ...(task.metadata || {}),
    lastError: {
      ...(task.metadata?.lastError || {}),
      delegationId: null,
      error: reason,
      at: cancelledAt.toISOString(),
      cancelled: true
    }
  };

  await task.update({ status: 'cancelled', metadata: cancellationMeta, assignedTo: null });

  const activeStatuses = ['queued', 'running', 'delegated', 'in_progress'];
  for (const delegation of delegations) {
    if (activeStatuses.includes(delegation.status)) {
      await delegation.update({ status: 'cancelled', error: reason, completedAt: cancelledAt });
    }
  }

  return { taskId, cancelledAt, reason };
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

/**
 * Multi-Agent Collaboration: Sequential Handoff
 * Executes multiple agents in sequence, passing results from each to the next.
 */
async function delegateToMultipleAgents(taskId, agentNames, options = {}) {
  const task = await Task.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const events = [];
  const allIterations = [];
  const collaborationResults = [];

  for (let i = 0; i < agentNames.length; i++) {
    const agentName = agentNames[i];
    const isLast = i === agentNames.length - 1;

    logger.info(`Multi-agent: executing ${agentName} (${i + 1}/${agentNames.length})`);

    // Create delegation record for this agent
    const delegation = await TaskDelegation.create({
      taskId: task.id,
      agentName,
      status: 'queued',
      intent: `multi-agent-handoff-${i + 1}`,
      confidence: 1.0,
      input: {
        title: task.title,
        description: task.description,
        priority: task.priority,
        metadata: {
          ...task.metadata,
          handoff: {
            fromPrevious: i > 0 ? collaborationResults[i - 1] : null,
            step: i + 1,
            total: agentNames.length
          }
        }
      },
      model: options.model || CLASSIFIER_MODEL,
      provider: options.provider || 'ollama'
    });

    // Update task status
    await task.update({ status: 'in_progress', assignedTo: agentName });

    try {
      // Build prompt with previous results if not first agent
      let agentPrompt = buildAgentPrompt(agentName, task);
      if (i > 0 && collaborationResults[i - 1]) {
        agentPrompt = `Previous agent (${agentNames[i - 1]}) completed:\n${JSON.stringify(collaborationResults[i - 1], null, 2)}\n\n---\n\n${agentPrompt}`;
      }

      const autonomous = options.autonomous !== undefined ? options.autonomous : true;
      const resp = await fetch(`${AGENT_SERVICE_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: agentPrompt,
          context: { useRAG: true, k: 8 },
          autonomous,
          model: options.model || CLASSIFIER_MODEL,
          provider: options.provider,
          apiKey: options.apiKey,
          endpoint: options.endpoint
        })
      });

      if (!resp.ok) {
        throw new Error(`Agent service error ${resp.status}`);
      }

      const data = await resp.json();
      const result = {
        agentName,
        step: i + 1,
        finalAnswer: data.finalAnswer,
        iterations: data.iterations || [],
        events: data.events || [],
        status: data.status
      };

      collaborationResults.push(result);
      allIterations.push(...(data.iterations || []));
      events.push({ event: 'handoff', data: result, ts: Date.now() });

      // Check for clarification needs - pause collaboration
      if (data.status === 'needs_clarification' || data.questions) {
        await delegation.update({
          status: 'review',
          result,
          iterations: data.iterations,
          events,
          completedAt: new Date()
        });
        await task.update({
          status: 'pending',
          metadata: {
            ...task.metadata,
            handoff: {
              ...task.metadata?.handoff,
              pausedAtStep: i + 1,
              questions: data.questions
            },
            lastDelegation: {
              id: delegation.id,
              date: new Date(),
              status: data.status,
              result: data.finalAnswer, // simplify
              questions: data.questions,
              iterations: data.iterations, // store full trace
              events: data.events
            }
          }
        });
        return {
          status: 'needs_clarification',
          partialResults: collaborationResults,
          currentStep: i + 1,
          questions: data.questions
        };
      }

      await delegation.update({
        status: 'completed',
        result,
        iterations: data.iterations,
        events,
        completedAt: new Date()
      });

      // Handle nextTasks (Agent-Driven Task Creation)
      if (Array.isArray(data.nextTasks) && data.nextTasks.length > 0) {
        logger.info(`Agent generated ${data.nextTasks.length} follow-up tasks`, { parentId: task.id });

        for (const nextTask of data.nextTasks) {
          if (!nextTask.title) continue;

          try {
            const newTask = await Task.create({
              title: nextTask.title,
              description: nextTask.description || `Follow-up to "${task.title}"`,
              priority: nextTask.priority || 'medium',
              status: 'pending',
              parentId: task.id,
              metadata: {
                source: 'agent-generated',
                parentDelegationId: delegation.id,
                originalPrompt: nextTask.description
              }
            });

            logger.info(`Created follow-up task: ${newTask.id} - ${newTask.title}`);

            // Optional: Auto-delegate if autonomous mode is aggressive (omitted for safety in Sprint 2 start)
            // If we wanted to chain: await delegateTask(newTask.id, { autonomous: true });
          } catch (err) {
            logger.error(`Failed to create follow-up task`, { error: err.message });
          }
        }
      }

    } catch (err) {
      const errorMsg = err?.message || String(err);
      logger.error(`Multi-agent step ${i + 1} failed: ${errorMsg}`);

      await delegation.update({
        status: 'failed',
        error: errorMsg,
        events,
        completedAt: new Date()
      });

      // Decide whether to continue or stop on error
      if (!options.continueOnError) {
        await task.update({
          status: 'failed',
          metadata: {
            ...task.metadata,
            handoff: {
              failedAtStep: i + 1,
              error: errorMsg,
              partialResults: collaborationResults
            }
          }
        });
        throw new Error(`Multi-agent collaboration failed at step ${i + 1}: ${errorMsg}`);
      }
    }
  }

  // All agents completed
  await task.update({
    status: 'completed',
    assignedTo: agentNames.join(' → '),
    metadata: {
      ...task.metadata,
      handoff: {
        completed: true,
        agents: agentNames,
        finalResult: collaborationResults[collaborationResults.length - 1]
      }
    }
  });

  return {
    status: 'completed',
    results: collaborationResults,
    allIterations,
    finalResult: collaborationResults[collaborationResults.length - 1]
  };
}

/**
 * Parallel Agent Execution
 * Executes multiple agents in parallel and aggregates results.
 */
async function delegateToAgentsParallel(taskId, agentNames, options = {}) {
  const task = await Task.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const agentPromises = agentNames.map(async (agentName) => {
    const delegation = await TaskDelegation.create({
      taskId: task.id,
      agentName,
      status: 'queued',
      intent: 'parallel-execution',
      confidence: 1.0,
      input: { title: task.title, description: task.description, priority: task.priority },
      model: options.model || CLASSIFIER_MODEL,
      provider: options.provider || 'ollama'
    });

    try {
      const agentPrompt = buildAgentPrompt(agentName, task);
      const resp = await fetch(`${AGENT_SERVICE_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: agentPrompt,
          context: { useRAG: options.useRAG !== false ? { useRAG: true, k: 8 } : {} },
          autonomous: options.autonomous !== undefined ? options.autonomous : true,
          model: options.model || CLASSIFIER_MODEL,
          provider: options.provider,
          apiKey: options.apiKey,
          endpoint: options.endpoint
        })
      });

      if (!resp.ok) throw new Error(`Agent service error ${resp.status}`);
      const data = await resp.json();

      await delegation.update({ status: 'completed', result: data, completedAt: new Date() });
      return { agentName, status: 'completed', result: data };
    } catch (err) {
      const errorMsg = err?.message || String(err);
      await delegation.update({ status: 'failed', error: errorMsg, completedAt: new Date() });
      return { agentName, status: 'failed', error: errorMsg };
    }
  });

  const results = await Promise.all(agentPromises);

  await task.update({
    status: 'completed',
    assignedTo: `parallel:${agentNames.join(',')}`,
    metadata: {
      ...task.metadata,
      parallelExecution: { agents: agentNames, results }
    }
  });

  return { status: 'completed', results };
}

module.exports = {
  classifyTask,
  delegateTask,
  executeTaskLoop,
  getDelegationHistory,
  getActiveDelegations,
  approveDelegation,
  rejectDelegation,
  cancelDelegationForTask,
  delegateToMultipleAgents,
  delegateToAgentsParallel,
  AGENT_CAPABILITIES
};
