const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');

// Get all agents
router.get('/', async (req, res) => {
  try {
    const agents = await Agent.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent by ID
router.get('/:id', async (req, res) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register new agent
router.post('/register', async (req, res) => {
  try {
    const { name, displayName, description, capabilities, models, endpoints } = req.body;

    // Validate required fields
    if (!name || !displayName || !capabilities || !models || !endpoints) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if agent already exists
    const existingAgent = await Agent.findOne({ where: { name } });
    if (existingAgent) {
      return res.status(409).json({ error: 'Agent with this name already exists' });
    }

    const agent = await Agent.create({
      name,
      displayName,
      description,
      capabilities,
      models,
      endpoints
    });

    res.status(201).json(agent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update agent
router.put('/:id', async (req, res) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    await agent.update(req.body);
    res.json(agent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete agent
router.delete('/:id', async (req, res) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    await agent.destroy();
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent status
router.get('/:id/status', async (req, res) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json({ 
      name: agent.name,
      status: agent.status,
      lastSeen: agent.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;