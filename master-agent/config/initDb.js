const db = require('./database');
const Task = require('../models/Task');
const Agent = require('../models/Agent');
const Suggestion = require('../models/Suggestion');
const Template = require('../models/Template');
const DelegationRun = require('../models/DelegationRun');
const MasterProfile = require('../models/MasterProfile');
const ChatLog = require('../models/ChatLog');
const PlanLog = require('../models/PlanLog');
const WorkflowRun = require('../models/WorkflowRun');

db.models.Task = Task;
db.models.Agent = Agent;
db.models.Suggestion = Suggestion;
db.models.Template = Template;
db.models.DelegationRun = DelegationRun;
db.models.MasterProfile = MasterProfile;
db.models.ChatLog = ChatLog;
db.models.PlanLog = PlanLog;
db.models.WorkflowRun = WorkflowRun;

async function initDatabase() {
  try {
    // Allow configurable sync strategy to avoid noisy backup/restore in dev
    // DB_SYNC_STRATEGY: 'alter' (default for Postgres), 'sync' (no alter), 'none'
    // For SQLite, default to 'sync' to prevent repeated backup/drop cycles when enums/JSON trigger ALTER churn.
    const defaultStrategy = db.sequelize.getDialect() === 'sqlite' ? 'sync' : 'alter';
    const strategy = (process.env.DB_SYNC_STRATEGY || defaultStrategy).toLowerCase();

    if (strategy === 'none') {
      console.log('Database sync skipped (DB_SYNC_STRATEGY=none)');
    } else if (strategy === 'sync') {
      await db.sequelize.sync({ force: false, alter: false });
      console.log('Database synchronized successfully (sync)');
    } else {
      // default: alter to apply additive changes without destructive drops
      await db.sequelize.sync({ force: false, alter: true });
      console.log('Database synchronized successfully (alter)');
    }

    // Seed master profile if missing
    const existingProfile = await MasterProfile.findOne();
    if (!existingProfile) {
      await MasterProfile.create({
        name: 'master-agent',
        displayName: 'Master Agent',
        persona: 'Orchestrator focused on clarity, brevity, and actionable steps.',
        traits: { tone: 'concise', risk: 'cautious', domain: 'general' },
        variables: { defaultModel: 'codellama:7b-instruct-q4_0' }
      });
    }

    // Create default agents if they don't exist
    const defaultAgents = [
      {
        name: 'master-agent',
        displayName: 'Master Agent',
        description: 'Central coordination hub for all agents',
        capabilities: ['task-management', 'agent-delegation', 'workflow-orchestration'],
        capabilityTags: ['orchestrator'],
        models: ['master-coordinator'],
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        },
        healthUrl: '/health',
        lastHealth: new Date()
      },
      {
        name: 'email-agent',
        displayName: 'Email Agent',
        description: 'Manages email drafting, sending, and inbox triage',
        capabilities: ['email-drafting', 'email-sending', 'inbox-triage'],
        capabilityTags: ['communication', 'email'],
        models: ['writer-base'],
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        },
        healthUrl: '/health',
        lastHealth: new Date()
      },
      {
        name: 'social-media-agent',
        displayName: 'Social Media Agent',
        description: 'Plans and posts social updates, tracks engagement',
        capabilities: ['content-planning', 'post-scheduling', 'engagement-tracking'],
        capabilityTags: ['social', 'content'],
        models: ['writer-base'],
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        },
        healthUrl: '/health',
        lastHealth: new Date()
      },
      {
        name: 'coding-agent',
        displayName: 'Coding Agent',
        description: 'Handles code generation, fixes, and reviews',
        capabilities: ['code-generation', 'bug-fixing', 'code-review'],
        capabilityTags: ['code', 'dev'],
        models: ['coder-base'],
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        },
        healthUrl: '/health',
        lastHealth: new Date()
      },
      {
        name: 'investment-agent',
        displayName: 'Investment Agent',
        description: 'Researches markets and produces investment briefs',
        capabilities: ['market-research', 'portfolio-insights', 'risk-analysis'],
        capabilityTags: ['finance', 'research'],
        models: ['analysis-base'],
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        },
        healthUrl: '/health',
        lastHealth: new Date()
      },
      {
        name: 'business-management-agent',
        displayName: 'Business Management Agent',
        description: 'Coordinates operations, tasks, and reporting',
        capabilities: ['ops-coordination', 'task-tracking', 'reporting'],
        capabilityTags: ['operations'],
        models: ['planner-base'],
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        },
        healthUrl: '/health',
        lastHealth: new Date()
      },
      {
        name: 'security-agent',
        displayName: 'Security Agent',
        description: 'Monitors and enforces security policies and incident response',
        capabilities: ['threat-detection', 'policy-enforcement', 'incident-response'],
        capabilityTags: ['security'],
        models: ['analysis-base'],
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        },
        healthUrl: '/health',
        lastHealth: new Date()
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