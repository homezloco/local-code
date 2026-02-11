# Master Agent

The Master Agent is the central coordination hub for the Local Agentic Assistant ecosystem. It manages task delegation, agent registration, and workflow orchestration across specialized agents.

## Features

- **Task Management**: Create, track, and manage tasks across agents
- **Agent Registration**: Dynamic registration of specialized agents
- **Plugin System**: Extensible architecture for adding new capabilities
- **Workflow Orchestration**: Coordinate complex multi-agent workflows
- **REST API**: Comprehensive API for agent communication

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Master Agent  │◄──►│   Specialized    │◄──►│   External      │
│                 │    │   Agents         │    │   Services      │
│  - Task Mgmt    │    │  - Email Agent   │    │  - Email        │
│  - Agent Reg    │    │  - Calendar      │    │  - Calendar     │
│  - Plugin Sys   │    │  - Project       │    │  - File Storage │
│  - Workflow     │    │  - Coding        │    │  - APIs         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Quick Start

1. **Install Dependencies**
   ```bash
   cd master-agent
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

3. **Environment Variables**
   Copy `.env.example` to `.env` and configure as needed.

## API Endpoints

### Tasks
- `GET /tasks` - Get all tasks
- `GET /tasks/:id` - Get specific task
- `POST /tasks` - Create new task
- `PUT /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

### Agents
- `GET /agents` - Get all agents
- `GET /agents/:id` - Get specific agent
- `POST /agents/register` - Register new agent
- `PUT /agents/:id` - Update agent
- `DELETE /agents/:id` - Delete agent
- `GET /agents/:id/status` - Get agent status

## Plugin Development

### Creating a Plugin

1. Create a new file in the `plugins` directory
2. Extend the `BasePlugin` class
3. Implement the required methods

```javascript
const BasePlugin = require('../plugins/BasePlugin');

class MyPlugin extends BasePlugin {
  async onInitialize() {
    // Plugin initialization logic
  }

  async onCleanup() {
    // Plugin cleanup logic
  }

  // Custom methods
  async myCustomAction() {
    // Your plugin logic
  }
}

module.exports = MyPlugin;
```

## Database

The Master Agent uses SQLite for data persistence. The database schema includes:

- **Tasks**: Task management data
- **Agents**: Agent registration and configuration

## Configuration

Configuration can be set via environment variables or the `.env` file:

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level (default: info)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License