const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
require('dotenv').config();
const initDatabase = require('./config/initDb');
const tasksRouter = require('./routes/tasks');
const agentsRouter = require('./routes/agents');
const emailRouter = require('./routes/email');
const PluginManager = require('./plugins/PluginManager');

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

// Initialize plugin system
const pluginManager = new PluginManager();
pluginManager.loadPlugins().then(() => {
  // Initialize database
  initDatabase().then(() => {
    // Start server after database is ready
    app.listen(PORT, () => {
      logger.info(`Master Agent server running on port ${PORT}`);
      logger.info(`Loaded ${pluginManager.getAllPlugins().length} plugins`);
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
