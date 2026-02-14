const express = require('express');
const router = express.Router();
const {
  delegateTask,
  getDelegationHistory,
  getActiveDelegations,
  approveDelegation,
  rejectDelegation,
  cancelDelegationForTask,
  executeTaskLoop,
  classifyTask,
  delegateToMultipleAgents,
  delegateToAgentsParallel,

  AGENT_CAPABILITIES,
  delegationEvents
} = require('../services/DelegationEngine');

const Task = require('../models/Task');

// Delegate a task
router.post('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const options = req.body || {};

    // Default autonomous to true if not specified, unless manually disabled
    if (options.autonomous === undefined) options.autonomous = true;

    const result = await delegateTask(taskId, options);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get delegation history for a task
router.get('/:taskId/delegations', async (req, res) => {
  try {
    const delegations = await getDelegationHistory(req.params.taskId);
    res.json({ data: delegations });
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

  const { taskId } = req.params;
  let cancelled = false;

  const send = async () => {
    try {
      const delegations = await getDelegationHistory(taskId);
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

  // Event listener for real-time updates
  const eventHandler = (data) => {
    if (data.taskId === taskId) {
      if (data.type === 'cancelled') {
        res.write(`event: cancelled\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
      // Always fetch fresh history to be safe
      void send();
    }
  };

  delegationEvents.on('update', eventHandler);

  const intervalId = setInterval(() => {
    if (cancelled) return clearInterval(intervalId);
    void send();
  }, 3000);

  req.on('close', () => {
    cancelled = true;
    clearInterval(intervalId);
    delegationEvents.off('update', eventHandler);
  });

  // initial push
  void send();
});

// Provide clarifications and re-delegate using autonomous /execute
router.post('/:taskId/clarify', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { answers } = req.body || {};
    const task = await Task.findByPk(taskId);
    if (!task) return res.status(404).json({ status: 'error', data: null, error: 'Task not found', message: 'Task not found' });

    const clarifications = Array.isArray(task.metadata?.clarifications) ? task.metadata.clarifications : [];
    if (Array.isArray(answers)) {
      clarifications.push(...answers.map((a) => ({ answer: a, at: new Date().toISOString() })));
    } else if (typeof answers === 'string' && answers.trim()) {
      clarifications.push({ answer: answers.trim(), at: new Date().toISOString() });
    }

    await task.update({ metadata: { ...(task.metadata || {}), clarifications }, status: 'pending' });

    const result = await delegateTask(taskId, { autonomous: true });
    res.json({ status: 'success', data: { taskId }, error: null, message: 'Clarifications submitted' });
  } catch (error) {
    res.status(400).json({ status: 'error', data: null, error: error.message, message: 'Failed to submit clarifications' });
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

// One-Click Retry
router.post('/:taskId/retry', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findByPk(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Reset retry count to allow fresh attempts
    const newMeta = { ...(task.metadata || {}), retryCount: 0 };

    // Reset status to pending so it gets picked up
    await task.update({ status: 'pending', metadata: newMeta });

    // Trigger delegation immediately
    // We treat manual retry as an autonomous run unless specified otherwise
    const result = await delegateTask(taskId, { autonomous: true, isRetry: true });

    res.json({ status: 'success', message: 'Task retry initiated', data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
