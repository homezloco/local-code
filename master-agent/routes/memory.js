const express = require('express');
const router = express.Router();
const MemoryService = require('../services/MemoryService');
const logger = require('../config/logger');

// Add a memory
router.post('/', async (req, res) => {
    try {
        const { content, agentId, metadata, type } = req.body;
        if (!content) return res.status(400).json({ error: 'Content is required' });

        const memory = await MemoryService.addMemory(content, { agentId, metadata, type });
        res.json(memory);
    } catch (error) {
        logger.error(`Add memory failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Search memories
router.post('/search', async (req, res) => {
    try {
        const { query, limit, minSimilarity } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        const results = await MemoryService.searchMemory(query, limit, minSimilarity);
        res.json({ results });
    } catch (error) {
        logger.error(`Search memory failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
