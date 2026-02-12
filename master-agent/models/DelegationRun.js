const { DataTypes } = require('sequelize');
const db = require('../config/database');

const DelegationRun = db.sequelize.define(
  'DelegationRun',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    taskId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    taskTitle: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'completed'
    },
    events: {
      type: DataTypes.JSON,
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSON
    }
  },
  {
    timestamps: true,
    tableName: 'delegation_runs'
  }
);

module.exports = DelegationRun;
