const { DataTypes } = require('sequelize');
const db = require('../config/database');

const Setting = db.sequelize.define('Setting', {
  key: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
  },
  value: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: 'settings',
});

module.exports = Setting;
