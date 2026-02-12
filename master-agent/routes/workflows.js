const express = require('express');
const Template = require('../models/Template');

const router = express.Router();

// Static workflow templates for specialized agents
const staticTemplates = [
  {
    id: 'outreach-email',
    title: 'Outreach Email Sequence',
    description: 'Research prospect, draft outreach email with follow-up variants, and produce send-ready copy.',
    category: 'email',
    agents: ['email-agent', 'social-agent', 'research-agent'],
    inputs: ['prospect_name', 'company', 'offer', 'tone', 'links'],
    steps: [
      'Research prospect/company context (social-agent or research).',
      'Draft primary outreach email and two short follow-ups (email-agent).',
      'Summarize key hooks and CTA variations.',
      'Return subject/body for each touch as send-ready Markdown.'
    ]
  },
  {
    id: 'repo-bugfix-pr',
    title: 'Repo Bugfix Plan + PR Draft',
    description: 'Create a plan, apply a minimal fix patch, and draft a PR message.',
    category: 'coding',
    agents: ['coding-agent'],
    inputs: ['repo_context', 'bug_description', 'acceptance_criteria'],
    steps: [
      'Summarize bug and acceptance criteria (coding-agent).',
      'Propose minimal fix plan with file-level notes.',
      'Produce patch or code suggestions respecting repo conventions.',
      'Draft PR title/body with testing notes and risks.'
    ]
  },
  {
    id: 'market-scan',
    title: 'Market Scan Summary',
    description: 'Gather quick landscape, notable players, risks, and next actions.',
    category: 'investment',
    agents: ['investment-agent', 'research-agent'],
    inputs: ['sector', 'geography', 'time_horizon'],
    steps: [
      'Collect top competitors and recent signals (investment-agent or research).',
      'Summarize opportunities, risks, and KPIs to watch.',
      'Propose 3-5 next research actions and data sources.',
      'Output concise memo with bullet sections.'
    ]
  },
  {
    id: 'calendar-optimization',
    title: 'Calendar Optimization',
    description: 'Rebalance schedule for priorities, deep work, and recovery with proposed moves.',
    category: 'time',
    agents: ['time-agent'],
    inputs: ['current_calendar_summary', 'priorities', 'constraints'],
    steps: [
      'Parse priorities vs current allocations (time-agent).',
      'Recommend swaps/blocks for deep work, admin, recovery.',
      'Provide 3 suggested schedules (conservative, balanced, aggressive).',
      'List explicit calendar edits (move, delete, add) with rationale.'
    ]
  }
];

const validateTemplate = (body) => {
  const errors = [];
  const requiredStrings = ['title', 'description', 'category'];
  requiredStrings.forEach((k) => {
    if (!body[k] || typeof body[k] !== 'string' || !body[k].trim()) errors.push(`${k} is required`);
  });
  if (!Array.isArray(body.agents) || body.agents.length === 0) errors.push('agents array is required');
  if (!Array.isArray(body.inputs)) errors.push('inputs array is required');
  if (!Array.isArray(body.steps) || body.steps.length === 0) errors.push('steps array is required');
  return errors;
};

// List workflows (metadata only)
router.get('/', async (_req, res) => {
  try {
    const customs = await Template.findAll({ order: [['createdAt', 'DESC']] });
    const combined = [
      ...staticTemplates.map((t) => ({ ...t, isCustom: false })),
      ...customs.map((t) => ({ ...t.toJSON(), isCustom: true }))
    ];
    const summary = combined.map(({ steps, ...rest }) => ({ ...rest, stepCount: (steps || []).length }));
    res.json({ workflows: summary });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to list workflows' });
  }
});

// Get workflow by id
router.get('/:id', async (req, res) => {
  const staticTemplate = staticTemplates.find((t) => t.id === req.params.id);
  if (staticTemplate) return res.json({ ...staticTemplate, isCustom: false });
  try {
    const template = await Template.findByPk(req.params.id);
    if (!template) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ ...template.toJSON(), isCustom: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to fetch workflow' });
  }
});

// Create custom workflow
router.post('/', async (req, res) => {
  const errors = validateTemplate(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  try {
    const created = await Template.create({ ...req.body, isCustom: true });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to create workflow' });
  }
});

// Update custom workflow
router.put('/:id', async (req, res) => {
  const errors = validateTemplate(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  try {
    const template = await Template.findByPk(req.params.id);
    if (!template) return res.status(404).json({ error: 'Workflow not found' });
    await template.update({ ...req.body, isCustom: true });
    res.json(template);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to update workflow' });
  }
});

// Delete custom workflow
router.delete('/:id', async (req, res) => {
  try {
    const template = await Template.findByPk(req.params.id);
    if (!template) return res.status(404).json({ error: 'Workflow not found' });
    await template.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to delete workflow' });
  }
});

module.exports = router;
