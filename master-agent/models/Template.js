const { DataTypes } = require('sequelize');
const db = require('../config/database');

const Template = db.sequelize.define(
  'Template',
  {
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
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false
    },
    agents: {
      type: DataTypes.JSON,
      allowNull: false
    },
    inputs: {
      type: DataTypes.JSON,
      allowNull: false
    },
    steps: {
      type: DataTypes.JSON,
      allowNull: false
    },
    isCustom: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    metadata: {
      type: DataTypes.JSON
    }
  },
  {
    timestamps: true,
    tableName: 'templates'
  }
);

module.exports = Template;
