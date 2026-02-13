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
const delegationsRouter = require('./routes/delegations');
const profileRouter = require('./routes/profile');
const chatRouter = require('./routes/chat');
const PluginManager = require('./plugins/PluginManager');
const axios = require('axios');
const Task = require('./models/Task');
const Agent = require('./models/Agent');
const MasterProfile = require('./models/MasterProfile');

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
app.use('/delegations', delegationsRouter);
app.use('/profile', profileRouter);
app.use('/chat', chatRouter);

// Initialize plugin system
const pluginManager = new PluginManager();
pluginManager.loadPlugins().then(() => {
  // Initialize database
  initDatabase().then(() => {
    // Start server after database is ready
    app.listen(PORT, () => {
      logger.info(`Master Agent server running on port ${PORT}`);
      logger.info(`Loaded ${pluginManager.getAllPlugins().length} plugins`);
      // Auto-delegate pending tasks on a simple interval
      const DELEGATION_INTERVAL_MS = 60_000;
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

          for (const task of tasks) {
            const taskText = typeof task === 'string'
              ? task
              : `${task.title || task.id || 'task'}\n${task.description || ''}`.trim();
            if (!taskText) continue;
            try {
              // mark in progress before sending
              await task.update({ status: 'in_progress' });
              const resp = await axios.post(
                delegateUrl,
                { task: taskText, agents: agentPayload, context: { useRAG: true, k: 4 } },
                { headers: { Accept: 'text/event-stream' }, responseType: 'stream', timeout: 30_000 }
              );
              // Close stream immediately after connect; we just fire-and-forget
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
