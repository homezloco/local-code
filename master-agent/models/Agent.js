const { DataTypes } = require('sequelize');
const db = require('../config/database');

const Agent = db.sequelize.define('Agent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  capabilities: {
    type: DataTypes.JSON,
    allowNull: false
  },
  models: {
    type: DataTypes.JSON,
    allowNull: false
  },
  endpoints: {
    type: DataTypes.JSON,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance'),
    defaultValue: 'active'
  },
  version: {
    type: DataTypes.STRING,
    defaultValue: '1.0.0'
  },
  metadata: {
    type: DataTypes.JSON
  }
}, {
  timestamps: true,
  tableName: 'agents'
});

module.exports = Agent;