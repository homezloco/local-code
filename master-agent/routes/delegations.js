const express = require('express');
const DelegationRun = require('../models/DelegationRun');

const router = express.Router();

// Create delegation run record
router.post('/', async (req, res) => {
  try {
    const { taskId, taskTitle, status = 'completed', events = [], metadata = {} } = req.body || {};
    if (!taskId || !taskTitle) return res.status(400).json({ error: 'taskId and taskTitle are required' });
    const run = await DelegationRun.create({ taskId, taskTitle, status, events, metadata });
    res.status(201).json(run);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to save delegation run' });
  }
});

// List recent runs
router.get('/', async (_req, res) => {
  try {
    const runs = await DelegationRun.findAll({ order: [['createdAt', 'DESC']], limit: 50 });
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to list delegation runs' });
  }
});

module.exports = router;
