const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Memory = sequelize.define('Memory', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    agentId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'ID of the agent that created or is associated with this memory'
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    embedding: {
        type: DataTypes.JSON, // Storing vector as JSON array
        allowNull: true
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    },
    type: {
        type: DataTypes.STRING,
        defaultValue: 'declarative', // declarative, episodic, procedural
        allowNull: false
    }
}, {
    indexes: [
        {
            fields: ['agentId']
        }
    ]
});

module.exports = Memory;
