const express = require('express');
const axios = require('axios');
const router = express.Router();
const Task = require('../models/Task');
const DelegationRun = require('../models/DelegationRun');

// Get all tasks
router.get('/', async (req, res) => {
  try {
    const includeDelegations = String(req.query.includeDelegations || '').toLowerCase() === 'true';

    const tasks = await Task.findAll({
      order: [['createdAt', 'DESC']]
    });

    if (!includeDelegations) {
      return res.json(tasks);
    }

    // Fetch recent delegation runs and map latest per taskId
    const runs = await DelegationRun.findAll({ order: [['createdAt', 'DESC']], limit: 200 });
    const latestByTask = new Map();
    for (const run of runs) {
      if (!latestByTask.has(run.taskId)) {
        latestByTask.set(run.taskId, run);
      }
    }

    const withDelegations = tasks.map((t) => {
      const latest = latestByTask.get(t.id);
      return {
        ...t.toJSON(),
        latestDelegation: latest
          ? {
              id: latest.id,
              status: latest.status,
              createdAt: latest.createdAt,
              updatedAt: latest.updatedAt,
              events: latest.events
            }
          : null
      };
    });

    return res.json(withDelegations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task by ID
router.get('/:id', async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create task
router.post('/', async (req, res) => {
  try {
    const task = await Task.create(req.body);
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update task
router.put('/:id', async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    await task.update(req.body);
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    await task.destroy();
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delegate task (forward to delegate service)
router.post('/delegate', async (req, res) => {
  const { task } = req.body || {};
  if (!task) {
    return res.status(400).json({ error: 'task payload is required' });
  }

  const delegateUrl = process.env.DELEGATE_URL || 'http://localhost:7788/delegate';

  try {
    const response = await axios.post(delegateUrl, { task });
    return res.status(200).json({ status: 'delegated', result: response.data });
  } catch (err) {
    const detail = err?.response?.data || err?.message || 'Delegate service failed';
    return res.status(502).json({ error: 'Failed to delegate task', detail });
  }
});

module.exports = router;