const { DataTypes } = require('sequelize');
const db = require('../config/database');

const ChatLog = db.sequelize.define(
  'ChatLog',
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
    userMessage: {
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
    tableName: 'chat_logs'
  }
);

module.exports = ChatLog;
