const express = require('express');
const router = express.Router();
const {
  delegateTask,
  getDelegationHistory,
  getActiveDelegations,
  approveDelegation,
  rejectDelegation,
  classifyTask,
  AGENT_CAPABILITIES
} = require('../services/DelegationEngine');

// Delegate a task to an agent
router.post('/:taskId/delegate', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentName, model, provider, apiKey, endpoint } = req.body;

    const result = await delegateTask(taskId, { agentName, model, provider, apiKey, endpoint });
    res.json(result);
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

module.exports = router;
