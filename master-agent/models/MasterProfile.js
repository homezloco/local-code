const { DataTypes } = require('sequelize');
const db = require('../config/database');

const MasterProfile = db.sequelize.define(
  'MasterProfile',
  {
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
    persona: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    traits: {
      type: DataTypes.JSON,
      allowNull: true
    },
    variables: {
      type: DataTypes.JSON,
      allowNull: true
    }
  },
  {
    timestamps: true,
    tableName: 'master_profiles'
  }
);

module.exports = MasterProfile;
