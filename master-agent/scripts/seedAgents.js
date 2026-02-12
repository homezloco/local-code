const Agent = require('../models/Agent');
const initDatabase = require('../config/initDb');

const agents = [
  {
    name: 'planner-agent',
    displayName: 'Planner (gemma3:1b)',
    description: 'Plans tasks with lightweight model',
    capabilities: ['planning'],
    models: ['gemma3:1b'],
    endpoints: {
      register: '/agents/register',
      delegate: '/tasks/delegate',
      status: '/agents/status'
    },
    status: 'active'
  },
  {
    name: 'coder-agent',
    displayName: 'Coder (codellama 7b)',
    description: 'Handles coding with codellama 7b (fallback instruct)',
    capabilities: ['codegen'],
    models: ['codellama:7b-instruct-q4_0', 'codellama:instruct'],
    endpoints: {
      register: '/agents/register',
      delegate: '/tasks/delegate',
      status: '/agents/status'
    },
    status: 'active'
  },
  {
    name: 'comms-agent',
    displayName: 'Comms (gemma3:1b)',
    description: 'Lightweight comms agent for email/social replies',
    capabilities: ['comms'],
    models: ['gemma3:1b'],
    endpoints: {
      register: '/agents/register',
      delegate: '/tasks/delegate',
      status: '/agents/status'
    },
    status: 'active'
  }
];

async function seed() {
  await initDatabase();
  for (const agent of agents) {
    const existing = await Agent.findOne({ where: { name: agent.name } });
    if (existing) {
      await existing.update(agent);
      // eslint-disable-next-line no-console
      console.log(`Updated agent: ${agent.name}`);
    } else {
      await Agent.create(agent);
      // eslint-disable-next-line no-console
      console.log(`Created agent: ${agent.name}`);
    }
  }
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
