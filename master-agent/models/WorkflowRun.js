const { DataTypes } = require('sequelize');
const db = require('../config/database');

const WorkflowRun = db.sequelize.define(
  'WorkflowRun',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workflowName: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'completed', 'failed'), defaultValue: 'pending' },
    error: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true }
  },
  {
    tableName: 'workflow_runs',
    timestamps: true
  }
);

module.exports = WorkflowRun;
