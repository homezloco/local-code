const { DataTypes } = require('sequelize');
const db = require('../config/database');

const PlanLog = db.sequelize.define(
  'PlanLog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    taskId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    agentName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mode: {
      type: DataTypes.ENUM('plan', 'codegen'),
      allowNull: false,
      defaultValue: 'plan'
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    responseText: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true
    }
  },
  {
    timestamps: true,
    tableName: 'plan_logs'
  }
);

module.exports = PlanLog;
