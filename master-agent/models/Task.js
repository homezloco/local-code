const { DataTypes } = require('sequelize');
const db = require('../config/database');

const Task = db.sequelize.define('Task', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'delegated', 'completed', 'failed', 'cancelled', 'needs_clarification', 'review'),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'in_progress', 'delegated', 'completed', 'failed', 'cancelled', 'needs_clarification', 'review']]
    }
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium'
  },
  assignedTo: {
    type: DataTypes.STRING
  },
  dueDate: {
    type: DataTypes.DATE
  },
  metadata: {
    type: DataTypes.JSON
  }
}, {
  timestamps: true,
  tableName: 'tasks'
});

module.exports = Task;