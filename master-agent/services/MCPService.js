const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const winston = require('winston');

class MCPService {
    constructor() {
        this.clients = new Map(); // serverName -> Client
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            defaultMeta: { service: 'mcp-service' },
            transports: [
                new winston.transports.File({ filename: 'logs/mcp-error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/mcp-combined.log' })
            ]
        });
    }

    /**
     * Connect to an MCP server via Stdio
     * @param {string} serverName - Unique name for this connection
     * @param {object} config - { command, args, env }
     */
    async connectStdio(serverName, config) {
        try {
            this.logger.info(`Connecting to MCP server: ${serverName}`, config);

            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: config.env || process.env
            });

            const client = new Client({
                name: "master-agent-client",
                version: "1.0.0"
            }, {
                capabilities: {
                    prompts: {},
                    resources: {},
                    tools: {}
                }
            });

            await client.connect(transport);
            this.clients.set(serverName, client);

            this.logger.info(`Connected to MCP server: ${serverName}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to connect to MCP server ${serverName}:`, error);
            throw error;
        }
    }

    /**
     * List all available tools from all connected servers
     * @returns {Promise<Array>} List of tools with server prefix
     */
    async listTools() {
        const allTools = [];

        for (const [serverName, client] of this.clients.entries()) {
            try {
                const result = await client.listTools();
                const tools = result.tools.map(tool => ({
                    ...tool,
                    name: `${serverName}__${tool.name}`, // Namespaced tool name
                    originalName: tool.name,
                    serverName: serverName
                }));
                allTools.push(...tools);
            } catch (error) {
                this.logger.error(`Failed to list tools for ${serverName}:`, error);
            }
        }

        return allTools;
    }

    /**
     * Call a specific tool
     * @param {string} namespacedToolName - 'serverName__toolName'
     * @param {object} args - Arguments for the tool
     */
    async callTool(namespacedToolName, args) {
        const [serverName, ...toolNameParts] = namespacedToolName.split('__');
        const toolName = toolNameParts.join('__'); // Rejoin in case tool name has underscores

        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP Server not found: ${serverName}`);
        }

        try {
            const result = await client.callTool({
                name: toolName,
                arguments: args
            });
            return result;
        } catch (error) {
            this.logger.error(`Failed to call tool ${namespacedToolName}:`, error);
            throw error;
        }
    }

    /**
     * Disconnect from a specific server
     * @param {string} serverName 
     */
    async disconnect(serverName) {
        const client = this.clients.get(serverName);
        if (client) {
            await client.close();
            this.clients.delete(serverName);
            this.logger.info(`Disconnected from ${serverName}`);
        }
    }
}

module.exports = new MCPService();
