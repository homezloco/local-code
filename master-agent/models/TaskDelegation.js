const { DataTypes } = require('sequelize');
const db = require('../config/database');

const TaskDelegation = db.sequelize.define('TaskDelegation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  agentName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('queued', 'running', 'completed', 'failed', 'review'),
    defaultValue: 'queued'
  },
  intent: {
    type: DataTypes.STRING,
    allowNull: true
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  input: {
    type: DataTypes.JSON,
    allowNull: true
  },
  result: {
    type: DataTypes.JSON,
    allowNull: true
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  model: {
    type: DataTypes.STRING,
    allowNull: true
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: true
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'task_delegations'
});

module.exports = TaskDelegation;
