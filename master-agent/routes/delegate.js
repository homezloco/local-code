const express = require('express');
const router = express.Router();
const {
  delegateTask,
  getDelegationHistory,
  getActiveDelegations,
  approveDelegation,
  rejectDelegation,
  executeTaskLoop,
  classifyTask,
  delegateToMultipleAgents,
  delegateToAgentsParallel,
  AGENT_CAPABILITIES
} = require('../services/DelegationEngine');

const Task = require('../models/Task');

// Delegate a task to an agent
router.post('/:taskId/delegate', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentName, model, provider, apiKey, endpoint, autonomous } = req.body;

    const result = await delegateTask(taskId, { agentName, model, provider, apiKey, endpoint, autonomous });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Execute a task in a synchronous Thought/Action/Observation loop and return the delegation record
router.post('/:taskId/execute', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentName, model, provider, apiKey, endpoint, autonomous } = req.body || {};
    const result = await executeTaskLoop(taskId, { agentName, model, provider, apiKey, endpoint, autonomous });
    res.json({ delegation: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Classify a task without delegating (preview which agent would handle it)
router.post('/:taskId/classify', async (req, res) => {
  try {
    const Task = require('../models/Task');
    const task = await Task.findByPk(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const classification = await classifyTask(task.title, task.description);
    res.json(classification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get delegation history for a task
router.get('/:taskId/delegations', async (req, res) => {
  try {
    const delegations = await getDelegationHistory(req.params.taskId);
    res.json(delegations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSE stream for delegation updates
router.get('/:taskId/delegations/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let cancelled = false;
  req.on('close', () => {
    cancelled = true;
  });

  const send = async () => {
    try {
      const delegations = await getDelegationHistory(req.params.taskId);
      if (!cancelled) {
        res.write(`event: delegations\n`);
        res.write(`data: ${JSON.stringify(delegations)}\n\n`);
      }
    } catch (error) {
      if (!cancelled) {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
      }
    }
  };

  const intervalId = setInterval(() => {
    if (cancelled) return clearInterval(intervalId);
    void send();
  }, 3000);

  // initial push
  void send();
});

// Provide clarifications and re-delegate using autonomous /execute
router.post('/:taskId/clarify', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { answers } = req.body || {};
    const task = await Task.findByPk(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const clarifications = Array.isArray(task.metadata?.clarifications) ? task.metadata.clarifications : [];
    if (Array.isArray(answers)) {
      clarifications.push(...answers.map((a) => ({ answer: a, at: new Date().toISOString() })));
    } else if (typeof answers === 'string' && answers.trim()) {
      clarifications.push({ answer: answers.trim(), at: new Date().toISOString() });
    }

    await task.update({ metadata: { ...(task.metadata || {}), clarifications }, status: 'pending' });

    const result = await delegateTask(taskId, { autonomous: true });
    res.json({ status: 're-delegated', delegation: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all active delegations
router.get('/active', async (req, res) => {
  try {
    const delegations = await getActiveDelegations();
    res.json(delegations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve a delegation in review
router.post('/delegations/:delegationId/approve', async (req, res) => {
  try {
    const delegation = await approveDelegation(req.params.delegationId);
    res.json(delegation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reject a delegation
router.post('/delegations/:delegationId/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const delegation = await rejectDelegation(req.params.delegationId, reason);
    res.json(delegation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// List available agent capabilities
router.get('/capabilities', (_req, res) => {
  const capabilities = Object.entries(AGENT_CAPABILITIES).map(([name, config]) => ({
    name,
    description: config.description,
    keywords: config.keywords
  }));
  res.json(capabilities);
});

// Multi-agent collaboration: sequential handoff
router.post('/:taskId/delegate/chain', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agents, model, provider, apiKey, endpoint, autonomous, continueOnError } = req.body;

    if (!Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: 'agents array is required' });
    }

    const result = await delegateToMultipleAgents(taskId, agents, {
      model,
      provider,
      apiKey,
      endpoint,
      autonomous,
      continueOnError
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Multi-agent collaboration: parallel execution
router.post('/:taskId/delegate/parallel', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agents, model, provider, apiKey, endpoint, autonomous, useRAG } = req.body;

    if (!Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: 'agents array is required' });
    }

    const result = await delegateToAgentsParallel(taskId, agents, {
      model,
      provider,
      apiKey,
      endpoint,
      autonomous,
      useRAG
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
