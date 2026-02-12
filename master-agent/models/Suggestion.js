const { DataTypes } = require('sequelize');
const db = require('../config/database');

const Suggestion = db.sequelize.define('Suggestion', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true
  },
  agentName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  score: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('new', 'merged', 'approved', 'rejected', 'auto_answered', 'auto_delegated', 'needs_review'),
    defaultValue: 'new'
  },
  clusterId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fingerprint: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  availableAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
});

module.exports = Suggestion;
