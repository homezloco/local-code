const db = require('./database');
const Task = require('../models/Task');
const Agent = require('../models/Agent');

db.models.Task = Task;
db.models.Agent = Agent;

async function initDatabase() {
  try {
    await db.sequelize.sync({ force: false });
    console.log('Database synchronized successfully');
    
    // Create default agents if they don't exist
    const defaultAgents = [
      {
        name: 'master-agent',
        displayName: 'Master Agent',
        description: 'Central coordination hub for all agents',
        capabilities: ['task-management', 'agent-delegation', 'workflow-orchestration'],
        models: ['master-coordinator'],
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        }
      }
    ];

    for (const agentData of defaultAgents) {
      const existingAgent = await Agent.findOne({ where: { name: agentData.name } });
      if (!existingAgent) {
        await Agent.create(agentData);
        console.log(`Created default agent: ${agentData.name}`);
      }
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

module.exports = initDatabase;