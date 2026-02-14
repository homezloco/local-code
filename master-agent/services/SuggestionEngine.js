// Universal fetch shim to support Node without global fetch and ESM-only node-fetch
const fetch =
  globalThis.fetch ||
  ((...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args)));
const AgentSuggestion = require('../models/AgentSuggestion');
const Agent = require('../models/Agent');
const { buildAgentContext } = require('./AgentDataAccess');
const { delegateTask } = require('./DelegationEngine');
const Task = require('../models/Task');
const logger = require('../config/logger');
const { Op } = require('sequelize');

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:7788';
const SUGGESTION_MODEL = process.env.SUGGESTION_MODEL || 'gemma3:1b';
const SUGGESTION_INTERVAL_MS = Number(process.env.SUGGESTION_INTERVAL_MS || 5 * 60 * 1000);
const SUGGESTION_EXPIRY_HOURS = Number(process.env.SUGGESTION_EXPIRY_HOURS || 24);
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const AGENT_PROMPTS = {
  'coding-agent': (ctx) => {
    const snippets = (ctx.codebaseSnippets || [])
      .map((s, i) => `[${i + 1}] ${s.path} (offset ${s.offset}):\n${s.snippet}`)
      .join('\n\n');
    const taskList = (ctx.currentTasks || [])
      .filter((t) => t.status !== 'completed')
      .map((t) => `- [${t.status}] ${t.title}`)
      .join('\n');
    return `You are a senior software engineer reviewing a codebase. Based on the code snippets and current tasks, suggest 1-3 actionable improvements.

Current tasks:\n${taskList || 'None'}

Code snippets from the workspace:\n${snippets || 'No code context available'}

Respond with a JSON array of suggestions. Each suggestion must have: title, description, rationale, priority (low/medium/high/urgent), category.
Example: [{"title":"Add unit tests for auth module","description":"The auth module has no test coverage","rationale":"Found no test files for auth/","priority":"high","category":"testing"}]
Respond ONLY with the JSON array, no other text.`;
  },

  'email-agent': (ctx) => {
    const taskList = (ctx.currentTasks || [])
      .map((t) => `- [${t.status}] ${t.title}: ${t.description || ''}`)
      .join('\n');
    return `You are an email and communications assistant. Based on the current tasks and email configuration status, suggest 1-3 email-related actions.

Email configured: ${ctx.emailConfigured ? 'Yes' : 'No - suggest setting up email first'}
Current tasks:\n${taskList || 'None'}
Secrets status: SMTP=${ctx.secretsStatus?.SMTP_HOST ? 'configured' : 'missing'}

Respond with a JSON array of suggestions. Each must have: title, description, rationale, priority, category.
Example: [{"title":"Send weekly status update","description":"Draft and send a weekly progress email to stakeholders","rationale":"No status emails sent this week","priority":"medium","category":"communication"}]
Respond ONLY with the JSON array.`;
  },

  'investment-agent': (ctx) => {
    const market = ctx.marketSnapshot?.body ? ctx.marketSnapshot.body.substring(0, 500) : 'No market data available';
    return `You are a financial analyst. Based on available market data and the user's task history, suggest 1-3 investment-related actions.

Market snapshot: ${market}
API keys available: OpenAI=${ctx.secretsStatus?.OPENAI_API_KEY ? 'yes' : 'no'}, OpenRouter=${ctx.secretsStatus?.OPENROUTER_API_KEY ? 'yes' : 'no'}

Respond with a JSON array of suggestions. Each must have: title, description, rationale, priority, category.
Example: [{"title":"Review crypto portfolio allocation","description":"Bitcoin and Ethereum prices have shifted significantly","rationale":"Market volatility detected","priority":"high","category":"portfolio-review"}]
Respond ONLY with the JSON array.`;
  },

  'social-media-agent': (ctx) => {
    const taskList = (ctx.currentTasks || [])
      .map((t) => `- [${t.status}] ${t.title}`)
      .join('\n');
    return `You are a social media strategist. Based on the user's current projects and tasks, suggest 1-3 social media content or engagement actions.

Current projects/tasks:\n${taskList || 'None'}

Respond with a JSON array of suggestions. Each must have: title, description, rationale, priority, category.
Example: [{"title":"Share project milestone on LinkedIn","description":"Post about the new agent delegation system launch","rationale":"Building in public increases engagement","priority":"medium","category":"content-creation"}]
Respond ONLY with the JSON array.`;
  },

  'time-management-agent': (ctx) => {
    const pending = (ctx.pendingTasks || [])
      .map((t) => `- [${t.priority}] ${t.title}`)
      .join('\n');
    return `You are a productivity expert. Based on the user's pending tasks and workload, suggest 1-3 time management improvements.

Pending tasks (${ctx.pendingCount || 0}):\n${pending || 'None'}
In-progress tasks: ${ctx.inProgressCount || 0}
Total tasks: ${(ctx.currentTasks || []).length}

Respond with a JSON array of suggestions. Each must have: title, description, rationale, priority, category.
Example: [{"title":"Prioritize urgent tasks first","description":"3 urgent tasks are still pending - schedule focused time blocks","rationale":"Urgent items risk missing deadlines","priority":"urgent","category":"prioritization"}]
Respond ONLY with the JSON array.`;
  }
};

/**
 * Check if an agent has the prerequisites it needs to operate.
 * Returns an array of setup suggestions if context is missing, or empty array if ready.
 */
function checkAgentPrerequisites(agentName, context) {
  const missing = [];

  switch (agentName) {
    case 'email-agent': {
      const s = context.secretsStatus || {};
      if (!s.SMTP_HOST || !s.SMTP_USER || !s.SMTP_PASS) {
        missing.push({
          title: 'Configure email credentials',
          description: 'I need SMTP credentials to connect to your email. Please go to the Settings/Secrets panel and enter your SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM so I can read your inbox, draft replies, and send emails on your behalf.',
          rationale: 'Without email credentials I cannot access your inbox or send messages.',
          priority: 'high',
          category: 'setup'
        });
      }
      if (!s.EMAIL_FROM) {
        missing.push({
          title: 'Set your sender email address',
          description: 'Please add EMAIL_FROM in the Secrets panel (e.g. you@company.com). This is the address I will send emails from.',
          rationale: 'I need to know which address to use as the sender.',
          priority: 'medium',
          category: 'setup'
        });
      }
      break;
    }
    case 'investment-agent': {
      const s = context.secretsStatus || {};
      const hasAnyApiKey = s.OPENAI_API_KEY || s.ANTHROPIC_API_KEY || s.OPENROUTER_API_KEY || s.XAI_API_KEY;
      const tasks = context.currentTasks || [];
      const hasInvestmentTasks = tasks.some((t) =>
        /invest|stock|portfolio|crypto|market|trade/i.test(`${t.title} ${t.description || ''}`)
      );

      if (!hasInvestmentTasks) {
        missing.push({
          title: 'Tell me about your investment goals',
          description: 'I need context to help you. Create a task describing your portfolio, investment strategy, or specific questions. For example: "Review my crypto portfolio: 2 BTC, 10 ETH, $5k in index funds" or "Research top dividend stocks for 2026".',
          rationale: 'I have no investment-related tasks or portfolio data to analyze yet.',
          priority: 'medium',
          category: 'context-needed'
        });
      }
      if (!context.marketSnapshot?.body) {
        missing.push({
          title: 'Enable web access for market data',
          description: 'I need web access to fetch live market prices and financial news. Make sure the agent-service is running and web fetch is enabled. You can also provide API keys for financial data providers in the Secrets panel.',
          rationale: 'Without market data access I cannot provide timely investment insights.',
          priority: 'medium',
          category: 'setup'
        });
      }
      break;
    }
    case 'coding-agent': {
      const snippets = context.codebaseSnippets || [];
      if (snippets.length === 0) {
        missing.push({
          title: 'Connect your codebase for analysis',
          description: 'I need access to your code to find improvements. Make sure the shared-rag service is running (port 7777) and has indexed your workspace. Run a reindex if needed: POST http://localhost:7777/reindex',
          rationale: 'The RAG service returned no code snippets — I cannot analyze your codebase without it.',
          priority: 'high',
          category: 'setup'
        });
      }
      break;
    }
    case 'social-media-agent': {
      const tasks = context.currentTasks || [];
      const hasSocialTasks = tasks.some((t) =>
        /social|post|tweet|linkedin|content|brand|marketing/i.test(`${t.title} ${t.description || ''}`)
      );
      if (!hasSocialTasks) {
        missing.push({
          title: 'Share your social media goals',
          description: 'Create a task describing what you want to achieve on social media. For example: "Build LinkedIn presence for my SaaS product" or "Create a content calendar for Twitter". Tell me which platforms you use and your target audience.',
          rationale: 'I have no social media tasks or brand context to work with yet.',
          priority: 'medium',
          category: 'context-needed'
        });
      }
      break;
    }
    case 'time-management-agent': {
      const tasks = context.currentTasks || [];
      if (tasks.length === 0) {
        missing.push({
          title: 'Add your tasks so I can help prioritize',
          description: 'I need to see your task list to suggest time management improvements. Start by adding your current tasks, projects, and deadlines. I can then help you prioritize, create time blocks, and set up reminders.',
          rationale: 'Your task list is empty — I need tasks to analyze your workload and suggest optimizations.',
          priority: 'medium',
          category: 'context-needed'
        });
      }
      break;
    }
  }

  return missing;
}

/**
 * Generate suggestions for a single agent.
 */
async function generateAgentSuggestions(agentName) {
  const promptBuilder = AGENT_PROMPTS[agentName];
  if (!promptBuilder) {
    logger.warn(`No prompt builder for agent: ${agentName}`);
    return [];
  }

  try {
    const context = await buildAgentContext(agentName);

    // Check prerequisites first — if missing, return setup suggestions directly
    const prerequisites = checkAgentPrerequisites(agentName, context);
    if (prerequisites.length > 0) {
      const expiresAt = new Date(Date.now() + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000);
      const results = [];
      for (const p of prerequisites) {
        const existing = await AgentSuggestion.findOne({
          where: { agentName, title: p.title, status: 'pending' }
        });
        if (existing) continue;

        const suggestion = await AgentSuggestion.create({
          agentName,
          title: p.title,
          description: p.description,
          rationale: p.rationale,
          priority: p.priority,
          category: p.category,
          status: 'pending',
          confidence: 1.0,
          dataSource: 'prerequisite-check',
          expiresAt,
          metadata: { type: 'setup-request' }
        });
        results.push(suggestion);
      }
      logger.info(`${agentName}: ${results.length} setup suggestions (missing prerequisites)`);
      return results;
    }

    const prompt = promptBuilder(context);

    const resp = await fetch(`${AGENT_SERVICE_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        context: { useRAG: false },
        model: SUGGESTION_MODEL
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      logger.warn(`Suggestion generation failed for ${agentName}: ${text}`);
      return [];
    }

    const data = await resp.json();
    const raw = data.plan || data.code || '';

    // Parse JSON from response (handle markdown code fences)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn(`No JSON array found in ${agentName} response`);
      return [];
    }

    const suggestions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(suggestions)) return [];

    const expiresAt = new Date(Date.now() + SUGGESTION_EXPIRY_HOURS * 60 * 60 * 1000);

    const results = [];
    for (const s of suggestions.slice(0, 3)) {
      if (!s.title || typeof s.title !== 'string') continue;

      // Deduplicate: skip if a pending suggestion with same title exists
      const existing = await AgentSuggestion.findOne({
        where: {
          agentName,
          title: s.title,
          status: 'pending'
        }
      });
      if (existing) continue;

      const suggestion = await AgentSuggestion.create({
        agentName,
        title: s.title.substring(0, 255),
        description: (s.description || '').substring(0, 2000),
        rationale: (s.rationale || '').substring(0, 1000),
        priority: ['low', 'medium', 'high', 'urgent'].includes(s.priority) ? s.priority : 'medium',
        category: (s.category || 'general').substring(0, 100),
        status: 'pending',
        confidence: 0.7,
        dataSource: context.dataSource,
        expiresAt,
        metadata: { model: SUGGESTION_MODEL }
      });
      results.push(suggestion);
    }

    logger.info(`Generated ${results.length} suggestions for ${agentName}`);
    return results;
  } catch (err) {
    logger.error(`Suggestion generation error for ${agentName}: ${err?.message || err}`);
    return [];
  }
}

/**
 * Run a full suggestion cycle for all active agents.
 */
async function runSuggestionCycle() {
  logger.info('Starting suggestion cycle...');

  // Expire old suggestions
  try {
    await AgentSuggestion.update(
      { status: 'expired' },
      {
        where: {
          status: 'pending',
          expiresAt: { [Op.lt]: new Date() }
        }
      }
    );
  } catch (err) {
    logger.warn(`Failed to expire old suggestions: ${err?.message || err}`);
  }

  const agentNames = Object.keys(AGENT_PROMPTS);
  const allSuggestions = [];

  for (const agentName of agentNames) {
    try {
      const suggestions = await generateAgentSuggestions(agentName);
      allSuggestions.push(...suggestions);
    } catch (err) {
      logger.error(`Cycle error for ${agentName}: ${err?.message || err}`);
    }
  }

  logger.info(`Suggestion cycle complete: ${allSuggestions.length} new suggestions`);
  return allSuggestions;
}

/**
 * Accept a suggestion: create a real task and auto-delegate.
 */
async function acceptSuggestion(suggestionId) {
  const suggestion = await AgentSuggestion.findByPk(suggestionId);
  if (!suggestion) throw new Error(`Suggestion ${suggestionId} not found`);
  if (suggestion.status !== 'pending') throw new Error(`Suggestion ${suggestionId} is not pending`);

  // Create a real task
  const task = await Task.create({
    title: suggestion.title,
    description: suggestion.description,
    priority: suggestion.priority,
    metadata: {
      fromSuggestion: suggestion.id,
      agentName: suggestion.agentName,
      rationale: suggestion.rationale,
      category: suggestion.category
    }
  });

  // Update suggestion
  await suggestion.update({
    status: 'accepted',
    acceptedTaskId: task.id
  });

  // Auto-delegate to the suggesting agent
  let delegationResult = null;
  try {
    delegationResult = await delegateTask(task.id, { agentName: suggestion.agentName });
  } catch (err) {
    logger.warn(`Auto-delegation failed for suggestion ${suggestionId}: ${err?.message || err}`);
  }

  return { suggestion, task, delegation: delegationResult };
}

/**
 * Reject a suggestion.
 */
async function rejectSuggestion(suggestionId, reason) {
  const suggestion = await AgentSuggestion.findByPk(suggestionId);
  if (!suggestion) throw new Error(`Suggestion ${suggestionId} not found`);
  if (suggestion.status !== 'pending') throw new Error(`Suggestion ${suggestionId} is not pending`);

  await suggestion.update({
    status: 'rejected',
    metadata: { ...(suggestion.metadata || {}), rejectionReason: reason }
  });

  return suggestion;
}

/**
 * Edit and accept a suggestion.
 */
async function editAndAcceptSuggestion(suggestionId, edits) {
  const suggestion = await AgentSuggestion.findByPk(suggestionId);
  if (!suggestion) throw new Error(`Suggestion ${suggestionId} not found`);
  if (suggestion.status !== 'pending') throw new Error(`Suggestion ${suggestionId} is not pending`);

  // Apply edits to the suggestion before accepting
  if (edits.title) suggestion.title = edits.title;
  if (edits.description) suggestion.description = edits.description;
  if (edits.priority) suggestion.priority = edits.priority;
  await suggestion.save();

  return acceptSuggestion(suggestionId);
}

/**
 * Get suggestion statistics.
 */
async function getSuggestionStats() {
  const all = await AgentSuggestion.findAll();
  const byAgent = {};
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  let expired = 0;

  for (const s of all) {
    if (!byAgent[s.agentName]) {
      byAgent[s.agentName] = { pending: 0, accepted: 0, rejected: 0, expired: 0, total: 0 };
    }
    byAgent[s.agentName][s.status] = (byAgent[s.agentName][s.status] || 0) + 1;
    byAgent[s.agentName].total += 1;

    if (s.status === 'pending') pending += 1;
    else if (s.status === 'accepted') accepted += 1;
    else if (s.status === 'rejected') rejected += 1;
    else if (s.status === 'expired') expired += 1;
  }

  return {
    total: all.length,
    pending,
    accepted,
    rejected,
    expired,
    acceptanceRate: all.length > 0 ? Math.round((accepted / all.length) * 100) : 0,
    byAgent
  };
}

let intervalHandle = null;

/**
 * Start the suggestion engine on an interval.
 */
function startEngine() {
  if (intervalHandle) {
    logger.warn('Suggestion engine already running');
    return;
  }

  logger.info(`Starting suggestion engine (interval: ${SUGGESTION_INTERVAL_MS}ms)`);

  // Run first cycle after a short delay to let services warm up
  setTimeout(() => {
    runSuggestionCycle().catch((err) => {
      logger.error(`Initial suggestion cycle failed: ${err?.message || err}`);
    });
  }, 10000);

  intervalHandle = setInterval(() => {
    runSuggestionCycle().catch((err) => {
      logger.error(`Suggestion cycle failed: ${err?.message || err}`);
    });
  }, SUGGESTION_INTERVAL_MS);
}

/**
 * Stop the suggestion engine.
 */
function stopEngine() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Suggestion engine stopped');
  }
}

/**
 * Reply to a suggestion with natural language.
 * The reply is sent to the LLM in the context of the original suggestion,
 * and the agent responds with an updated suggestion or acknowledgment.
 */
async function replySuggestion(suggestionId, replyText) {
  const suggestion = await AgentSuggestion.findByPk(suggestionId);
  if (!suggestion) throw new Error(`Suggestion ${suggestionId} not found`);
  if (suggestion.status !== 'pending') throw new Error(`Suggestion ${suggestionId} is not pending`);

  const conversationHistory = suggestion.metadata?.conversation || [];
  conversationHistory.push({ role: 'user', text: replyText, at: new Date().toISOString() });

  const prompt = `You are the ${suggestion.agentName.replace(/-/g, ' ')}. You previously suggested:

Title: ${suggestion.title}
Description: ${suggestion.description || ''}
Rationale: ${suggestion.rationale || ''}
Category: ${suggestion.category || 'general'}

The user replied: "${replyText}"

Based on their reply, do ONE of the following:
1. If they provided information you needed (credentials, goals, context), acknowledge it and suggest a concrete next action.
2. If they have a question, answer it helpfully.
3. If they want to modify the suggestion, provide an updated version.

Respond with a JSON object: {"reply":"your response to the user","updatedTitle":"optional new title or null","updatedDescription":"optional new description or null","actionNeeded":"none|accept|setup","setupInstructions":"if actionNeeded is setup, what they should do next"}
Respond ONLY with the JSON object.`;

  try {
    const resp = await fetch(`${AGENT_SERVICE_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        context: { useRAG: false },
        model: SUGGESTION_MODEL
      })
    });

    let agentReply = 'Thanks for the info! I\'ll use this in my next analysis.';
    let updatedTitle = null;
    let updatedDescription = null;

    if (resp.ok) {
      const data = await resp.json();
      const raw = data.plan || data.code || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          agentReply = parsed.reply || agentReply;
          updatedTitle = parsed.updatedTitle || null;
          updatedDescription = parsed.updatedDescription || null;
        } catch (parseErr) {
          agentReply = raw.substring(0, 500);
        }
      } else {
        agentReply = raw.substring(0, 500) || agentReply;
      }
    }

    conversationHistory.push({ role: 'agent', text: agentReply, at: new Date().toISOString() });

    const updates = {
      metadata: { ...(suggestion.metadata || {}), conversation: conversationHistory }
    };
    if (updatedTitle) updates.title = updatedTitle;
    if (updatedDescription) updates.description = updatedDescription;

    await suggestion.update(updates);

    return {
      suggestion,
      agentReply,
      conversation: conversationHistory
    };
  } catch (err) {
    conversationHistory.push({
      role: 'agent',
      text: 'Got it, thanks! I\'ll factor this into my next suggestions.',
      at: new Date().toISOString()
    });
    await suggestion.update({
      metadata: { ...(suggestion.metadata || {}), conversation: conversationHistory }
    });

    return {
      suggestion,
      agentReply: 'Got it, thanks! I\'ll factor this into my next suggestions.',
      conversation: conversationHistory
    };
  }
}

module.exports = {
  generateAgentSuggestions,
  runSuggestionCycle,
  acceptSuggestion,
  rejectSuggestion,
  editAndAcceptSuggestion,
  replySuggestion,
  getSuggestionStats,
  startEngine,
  stopEngine
};
