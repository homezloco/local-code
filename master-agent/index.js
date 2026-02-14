const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
require('dotenv').config();
const initDatabase = require('./config/initDb');
const tasksRouter = require('./routes/tasks');
const agentsRouter = require('./routes/agents');
const emailRouter = require('./routes/email');
const suggestionsRouter = require('./routes/suggestions');
const workflowsRouter = require('./routes/workflows');
const delegateRouter = require('./routes/delegate');
const delegationsRouter = require('./routes/delegations');
const profileRouter = require('./routes/profile');
const chatRouter = require('./routes/chat');
const PluginManager = require('./plugins/PluginManager');
const axios = require('axios');
const Task = require('./models/Task');
const Agent = require('./models/Agent');
const MasterProfile = require('./models/MasterProfile');
const { runStartupWorkflows } = require('./services/startupWorkflows');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001; // Changed from 3000 to 3001

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Master Agent API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/tasks', tasksRouter);
app.use('/agents', agentsRouter);
app.use('/email', emailRouter);
app.use('/suggestions', suggestionsRouter);
app.use('/workflows', workflowsRouter);
app.use('/api/delegate', delegateRouter);
app.use('/delegations', delegationsRouter);
app.use('/profile', profileRouter);
app.use('/chat', chatRouter);
app.use('/mcp', require('./routes/mcp'));
app.use('/memory', require('./routes/memory'));

// Initialize plugin system
const pluginManager = new PluginManager();
pluginManager.loadPlugins().then(() => {
  // Initialize database
  initDatabase().then(() => {
    // Start server after database is ready
    app.listen(PORT, () => {
      logger.info(`Master Agent server running on port ${PORT}`);
      logger.info(`Loaded ${pluginManager.getAllPlugins().length} plugins`);
      // Run startup workflows (auto tasks per agent)
      runStartupWorkflows({ logger }).catch((err) => {
        logger.error(`Startup workflows failed: ${err?.message || err}`);
      });
      const AUTO_DELEGATE_ENABLED = process.env.AUTO_DELEGATE_ENABLED !== 'false';
      const DELEGATION_INTERVAL_MS = Number(process.env.DELEGATION_INTERVAL_MS || 300_000); // default 5m in dev
      const RECENT_DELEGATION_AGE_MS = Number(process.env.RECENT_DELEGATION_AGE_MS || 300_000);

      if (AUTO_DELEGATE_ENABLED) {
        setInterval(async () => {
          try {
            logger.info('Auto-delegate sweep starting');
            const tasks = await Task.findAll({ order: [['createdAt', 'DESC']] });
            const agents = await Agent.findAll({ attributes: ['name', 'capabilities'] });
            if (!agents.length) {
              logger.info('Auto-delegate sweep skipped: no agents');
              return;
            }
            if (!tasks.length) {
              logger.info('Auto-delegate sweep skipped: no tasks');
              return;
            }

            const delegateUrl = process.env.DELEGATE_URL || `http://localhost:7788/delegate`;
            const agentPayload = agents.map((a) => ({ name: a.name, capabilities: a.capabilities || [] }));
            const now = Date.now();

            for (const task of tasks) {
              if (!task || !task.status) continue;
              const status = (task.status || '').toLowerCase();
              if (['completed', 'failed', 'review', 'in_progress'].includes(status)) {
                continue;
              }
              const updatedAt = task.updatedAt ? new Date(task.updatedAt).getTime() : 0;
              if (updatedAt && now - updatedAt < RECENT_DELEGATION_AGE_MS) {
                continue;
              }

              const taskText = typeof task === 'string'
                ? task
                : `${task.title || task.id || 'task'}\n${task.description || ''}`.trim();
              if (!taskText) continue;
              try {
                await task.update({ status: 'in_progress' });
                const resp = await axios.post(
                  delegateUrl,
                  { task: taskText, agents: agentPayload, context: { useRAG: true, k: 4 } },
                  { headers: { Accept: 'text/event-stream' }, responseType: 'stream', timeout: 30_000 }
                );
                resp.data?.destroy?.();
                logger.info(`Auto-delegated task ${task.id || task.title}`);
                await task.update({ status: 'completed' });
              } catch (err) {
                const detail = err?.response?.data || err?.message;
                logger.error(`Auto-delegate failed for task ${task.id || task.title}: ${detail}`);
                try {
                  await task.update({ status: 'failed' });
                } catch (updateErr) {
                  logger.error(`Failed to update task status after delegate error: ${updateErr?.message}`);
                }
              }
            }
            logger.info('Auto-delegate sweep complete');
          } catch (err) {
            logger.error(`Auto-delegate sweep failed: ${err?.message}`);
          }
        }, DELEGATION_INTERVAL_MS);
      } else {
        logger.info('Auto-delegate sweep disabled via AUTO_DELEGATE_ENABLED=false');
      }
    });
  }).catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}).catch(error => {
  logger.error('Failed to load plugins:', error);
  process.exit(1);
});

module.exports = app;
