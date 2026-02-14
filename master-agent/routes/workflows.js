const express = require('express');
const Template = require('../models/Template');
const WorkflowRun = require('../models/WorkflowRun');
const { listWorkflowFiles, updateWorkflowAuto, saveWorkflowFile, validateWorkflow, readWorkflowFile } = require('../services/startupWorkflows');
const { delegateTask } = require('../services/DelegationEngine');

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

// List workflow files (startup workflows)
router.get('/files', async (_req, res) => {
  try {
    const files = await listWorkflowFiles();
    res.json({ workflows: files });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to list workflow files' });
  }
});

// Toggle auto flag for a workflow file
router.post('/files/:name/auto', async (req, res) => {
  try {
    const { auto } = req.body || {};
    await updateWorkflowAuto(req.params.name, Boolean(auto));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to update workflow auto flag' });
  }
});

// Get a workflow file
router.get('/files/:name', async (req, res) => {
  try {
    const wf = await readWorkflowFile(req.params.name);
    res.json({ workflow: wf });
  } catch (err) {
    res.status(404).json({ error: err?.message || 'Workflow not found' });
  }
});

// Update/save a workflow file
router.put('/files/:name', async (req, res) => {
  try {
    const wf = req.body;
    const validationError = validateWorkflow(wf);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    await saveWorkflowFile(wf);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to save workflow' });
  }
});

// Suggest a new workflow (prototype): calls master agent to draft JSON; requires approval to save
router.post('/suggest', async (req, res) => {
  try {
    const { topic = 'general startup workflow', prompt, agent = 'master-agent', approve = false, workflow: providedWorkflow } = req.body || {};

    // If caller provided a workflow and wants approval, validate and save directly
    if (approve && providedWorkflow) {
      const validationError = validateWorkflow(providedWorkflow);
      if (validationError) {
        return res.status(400).json({ error: validationError, valid: false });
      }
      await saveWorkflowFile(providedWorkflow);
      return res.json({ proposal: providedWorkflow, valid: true, saved: true });
    }

    const effectivePrompt = prompt || `Propose a startup workflow in JSON with fields: name, description, agent, auto (bool), priority (low|medium|high|urgent), schedule ('startup'), steps (array of {title, description}). Topic: ${topic}. Keep steps <=4, concise titles. Respond with JSON only.`;
    const fakeTaskId = `workflow-suggest-${Date.now()}`;
    const result = await delegateTask(fakeTaskId, { agentName: agent, autonomous: true, overridePrompt: effectivePrompt });
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    let parsed = null;
    try {
      parsed = typeof result === 'object' && result?.result ? result.result : JSON.parse(text);
    } catch {
      // fall back to raw
    }
    const workflow = parsed && parsed.name ? parsed : null;
    const validationError = workflow ? validateWorkflow(workflow) : 'invalid JSON result';
    const response = { proposal: workflow || result, valid: !validationError, validationError };
    if (approve && workflow && !validationError) {
      await saveWorkflowFile(workflow);
      response.saved = true;
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to suggest workflow' });
  }
});

// List recent workflow runs (startup activity)
router.get('/runs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const runs = await WorkflowRun.findAll({ order: [['createdAt', 'DESC']], limit });
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to list workflow runs' });
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
