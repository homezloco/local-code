const express = require('express');
const axios = require('axios');
const router = express.Router();
const logger = require('../config/logger');

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:7788';

// Proxy MCP connection request to agent-service
router.post('/connect', async (req, res) => {
    try {
        const { name, command, args, env } = req.body;
        logger.info(`Proxying MCP connect request for ${name}`);
        const response = await axios.post(`${AGENT_SERVICE_URL}/mcp/connect`, { name, command, args, env });
        res.json(response.data);
    } catch (error) {
        logger.error(`MCP connect proxy failed: ${error.message}`);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Proxy list tools request to agent-service
router.get('/tools', async (req, res) => {
    try {
        logger.info('Proxying MCP tools list request');
        const response = await axios.get(`${AGENT_SERVICE_URL}/mcp/tools`);
        res.json(response.data);
    } catch (error) {
        logger.error(`MCP tools proxy failed: ${error.message}`);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

module.exports = router;
