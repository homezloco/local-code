const fs = require('fs/promises');
const path = require('path');
const Task = require('../models/Task');
const WorkflowRun = require('../models/WorkflowRun');
const { delegateTask } = require('./DelegationEngine');

const STARTUP_WORKFLOWS_ENABLED = process.env.STARTUP_WORKFLOWS_ENABLED !== 'false';
const envWorkflowsDir = process.env.WORKFLOWS_DIR;
const normalizedEnvDir = envWorkflowsDir && !path.isAbsolute(envWorkflowsDir)
  ? envWorkflowsDir.replace(/^master-agent[\\/]/, '')
  : envWorkflowsDir;
const WORKFLOWS_DIR = normalizedEnvDir
  ? (path.isAbsolute(normalizedEnvDir) ? normalizedEnvDir : path.join(__dirname, '..', normalizedEnvDir))
  : path.join(__dirname, '..', 'workflows');
const MAX_WORKFLOWS = Number(process.env.STARTUP_WORKFLOWS_MAX || 20);
const STARTUP_WORKFLOWS_CONCURRENCY = Number(process.env.STARTUP_WORKFLOWS_CONCURRENCY || 2);
const STARTUP_WORKFLOWS_RETRIES = Number(process.env.STARTUP_WORKFLOWS_RETRIES || 1);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function validateWorkflow(wf) {
  if (!wf || typeof wf !== 'object') return 'not an object';
  if (!wf.name || typeof wf.name !== 'string') return 'missing name';
  if (!wf.agent || typeof wf.agent !== 'string') return 'missing agent';
  if (!Array.isArray(wf.steps) || wf.steps.length === 0) return 'steps must be a non-empty array';
  for (const step of wf.steps) {
    if (!step || typeof step !== 'object') return 'step not an object';
    if (!step.title || typeof step.title !== 'string') return 'step missing title';
  }
  return null;
}

async function saveWorkflowFile(workflow, logger) {
  const err = validateWorkflow(workflow);
  if (err) throw new Error(err);
  const safeName = workflow.name.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filePath = path.join(WORKFLOWS_DIR, `${safeName}.json`);
  await fs.mkdir(WORKFLOWS_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), 'utf8');
  logger?.info?.(`Saved workflow file ${filePath}`);
  return { filePath };
}

async function readWorkflowFile(name) {
  const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filePath = path.join(WORKFLOWS_DIR, `${safeName}.json`);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function loadWorkflows(logger) {
  try {
    await fs.mkdir(WORKFLOWS_DIR, { recursive: true });
    const entries = await fs.readdir(WORKFLOWS_DIR, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile() && e.name.endsWith('.json')).slice(0, MAX_WORKFLOWS);
    logger?.info?.(`startupWorkflows: scanning ${WORKFLOWS_DIR}, found files: ${files.map((f) => f.name).join(', ') || 'none'}`);
    const workflows = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(WORKFLOWS_DIR, f.name), 'utf8');
        const wf = JSON.parse(raw);
        const err = validateWorkflow(wf);
        if (err) {
          logger?.warn?.(`Invalid workflow file ${f.name}: ${err}`);
          continue;
        }
        const schedule = wf.schedule || 'startup';
        if (schedule !== 'startup') continue;
        workflows.push({
          name: wf.name,
          description: wf.description || wf.name,
          agent: wf.agent,
          steps: wf.steps,
          auto: wf.auto !== false,
          priority: wf.priority || 'medium'
        });
      } catch (err) {
        logger?.warn?.(`Invalid workflow file ${f.name}: ${err?.message || err}`);
      }
    }
    return workflows;
  } catch (err) {
    logger?.warn?.(`Failed to load workflows: ${err?.message || err}`);
    return [];
  }
}

async function createTaskIfNeeded(step, workflow, logger) {
  const runKey = `${workflow.name}:${step.title}:${todayKey()}`;
  const existing = await Task.findOne({ where: { 'metadata.runKey': runKey } });
  if (existing) return null;

  const task = await Task.create({
    title: step.title,
    description: step.description || workflow.description,
    priority: step.priority || workflow.priority || 'medium',
    metadata: { ...(step.metadata || {}), workflow: workflow.name, runKey }
  });
  logger?.info?.(`Created startup task ${task.id} for workflow ${workflow.name}`);
  return task;
}

async function runStartupWorkflows({ logger } = {}) {
  if (!STARTUP_WORKFLOWS_ENABLED) {
    logger?.info?.('STARTUP_WORKFLOWS_ENABLED=false; skipping startup workflows');
    return;
  }
  const workflows = await loadWorkflows(logger);
  if (!workflows.length) {
    logger?.info?.('No startup workflows found');
    return;
  }

  const queue = [];
  for (const wf of workflows) {
    if (!wf.auto) continue;
    for (const step of wf.steps) {
      queue.push({ wf, step });
    }
  }

  logger?.info?.(`startupWorkflows: auto workflows queued steps=${queue.length}`);

  const worker = async (item) => {
    const { wf, step } = item;
    let attempt = 0;
    let success = false;
    let lastErr = null;
    let runRecord = null;
    try {
      runRecord = await WorkflowRun.create({
        workflowName: wf.name,
        status: 'pending',
        metadata: { stepTitle: step.title, agent: wf.agent },
        startedAt: new Date()
      });
    } catch (err) {
      logger?.warn?.(`Failed to create WorkflowRun record for ${wf.name}: ${err?.message || err}`);
    }

    while (attempt <= STARTUP_WORKFLOWS_RETRIES && !success) {
      attempt += 1;
      try {
        const task = await createTaskIfNeeded(step, wf, logger);
        if (!task) {
          if (runRecord) await runRecord.update({ status: 'completed', metadata: { ...(runRecord.metadata || {}), skipped: 'existing task' }, completedAt: new Date() });
          return;
        }
        await delegateTask(task.id, { agentName: wf.agent, autonomous: true });
        if (runRecord) {
          await runRecord.update({
            status: 'completed',
            metadata: { ...(runRecord.metadata || {}), taskId: task.id },
            completedAt: new Date()
          });
        }
        logger?.info?.(`Delegated startup workflow step: ${wf.name} -> ${wf.agent}`);
        success = true;
      } catch (err) {
        lastErr = err;
        logger?.warn?.(`Startup workflow step failed (${wf.name}) attempt ${attempt}: ${err?.message || err}`);
        if (attempt > STARTUP_WORKFLOWS_RETRIES) {
          try {
            if (runRecord) {
              await runRecord.update({
                status: 'failed',
                error: err?.message || String(err),
                completedAt: new Date()
              });
            } else {
              await WorkflowRun.create({
                workflowName: wf.name,
                status: 'failed',
                error: err?.message || String(err),
                metadata: { stepTitle: step.title, agent: wf.agent },
                startedAt: new Date(),
                completedAt: new Date()
              });
            }
          } catch (logErr) {
            logger?.warn?.(`Failed to record workflow run (${wf.name}): ${logErr?.message || logErr}`);
          }
        }
      }
    }
  };

  const concurrency = Math.max(1, STARTUP_WORKFLOWS_CONCURRENCY);
  const runners = [];
  for (let i = 0; i < concurrency; i += 1) {
    const runner = (async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        await worker(item);
      }
    })();
    runners.push(runner);
  }
  await Promise.all(runners);
}

async function listWorkflowFiles(logger) {
  const raw = await loadWorkflows(logger);
  return raw.map((wf) => ({
    name: wf.name,
    description: wf.description,
    agent: wf.agent,
    auto: wf.auto,
    stepCount: (wf.steps || []).length
  }));
}

async function updateWorkflowAuto(name, auto, logger) {
  const filePath = path.join(WORKFLOWS_DIR, `${name}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const wf = JSON.parse(data);
    wf.auto = !!auto;
    const err = validateWorkflow(wf);
    if (err) throw new Error(`Validation failed after update: ${err}`);
    await fs.writeFile(filePath, JSON.stringify(wf, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    logger?.warn?.(`Failed to update workflow ${name}: ${err?.message || err}`);
    throw err;
  }
}

module.exports = { runStartupWorkflows, listWorkflowFiles, updateWorkflowAuto, saveWorkflowFile, validateWorkflow, readWorkflowFile };
