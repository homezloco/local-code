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
    const { name, displayName, description, capabilities, models, endpoints, metadata, capabilityTags, healthUrl } = req.body;

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
      endpoints,
      metadata: metadata || {},
      capabilityTags: capabilityTags || [],
      healthUrl: healthUrl || null
    });

    res.status(201).json(agent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Bootstrap specialized agents (idempotent upsert)
router.post('/bootstrap', async (req, res) => {
  try {
    const presets = [
      {
        name: 'email-agent',
        displayName: 'Email Agent',
        description: 'Handles outreach, replies, and follow-ups.',
        capabilities: ['email', 'outreach', 'followups', 'summaries'],
        capabilityTags: ['communication', 'outreach'],
        models: ['llama3.1:8b', 'gpt-4o-mini'],
        endpoints: { plan: '/plan', action: '/email/send' },
        status: 'active',
        metadata: { channel: 'email' },
        healthUrl: '/health'
      },
      {
        name: 'coding-agent',
        displayName: 'Coding Agent',
        description: 'Planning and code generation for repositories.',
        capabilities: ['coding', 'planning', 'patches'],
        capabilityTags: ['code', 'dev'],
        models: ['qwen2.5-coder:14b', 'llama3.1:8b'],
        endpoints: { plan: '/plan', codegen: '/codegen' },
        status: 'active',
        metadata: { repo: 'local' },
        healthUrl: '/health'
      },
      {
        name: 'investment-agent',
        displayName: 'Investment Agent',
        description: 'Market scans, summaries, and diligence checklists.',
        capabilities: ['research', 'summaries', 'diligence'],
        capabilityTags: ['finance', 'research'],
        models: ['llama3.1:8b', 'gpt-4o-mini'],
        endpoints: { plan: '/plan', research: '/research' },
        status: 'active',
        metadata: { domain: 'finance' },
        healthUrl: '/health'
      },
      {
        name: 'social-agent',
        displayName: 'Social Agent',
        description: 'Content drafting, scheduling, and engagement suggestions.',
        capabilities: ['content', 'scheduling', 'engagement'],
        capabilityTags: ['social', 'content'],
        models: ['llama3.1:8b', 'gemma3:1b'],
        endpoints: { plan: '/plan', post: '/social/post' },
        status: 'active',
        metadata: { platforms: ['x', 'linkedin'] },
        healthUrl: '/health'
      },
      {
        name: 'time-agent',
        displayName: 'Time Agent',
        description: 'Calendar optimization and reminders.',
        capabilities: ['calendar', 'prioritization', 'reminders'],
        capabilityTags: ['productivity', 'calendar'],
        models: ['llama3.1:8b'],
        endpoints: { plan: '/plan', calendar: '/calendar/optimize' },
        status: 'active',
        metadata: { calendar: 'local' },
        healthUrl: '/health'
      }
    ];

    const results = [];
    for (const preset of presets) {
      const [agent, created] = await Agent.upsert(preset, { returning: true });
      results.push({ name: agent.name, created });
    }

    res.json({ message: 'Bootstrapped specialized agents', results });
  } catch (error) {
    res.status(500).json({ error: error.message });
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