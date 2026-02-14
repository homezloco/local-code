const axios = require('axios');
const { Op } = require('sequelize');
const Memory = require('../models/Memory');
const logger = require('../config/logger');

// Using mathjs for cosine similarity if available, otherwise manual
// But we need to query all memories and compute similarity in-memory for SQLite
// For a production system we'd use pgvector or similar, but this is a local agent.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';

class MemoryService {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Generate embeddings for text using Ollama
     * @param {string} text 
     * @returns {Promise<Array<number>>}
     */
    async getEmbedding(text) {
        try {
            const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
                model: EMBEDDING_MODEL,
                prompt: text
            });
            return response.data.embedding;
        } catch (error) {
            logger.error(`Embedding generation failed: ${error.message}`);
            // Fallback: if model missing, try pulling it? or fail gracefully
            // For now, return null
            return null;
        }
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param {Array<number>} vecA 
     * @param {Array<number>} vecB 
     * @returns {number}
     */
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Add a new memory
     * @param {string} content 
     * @param {object} options { agentId, metadata, type }
     */
    async addMemory(content, options = {}) {
        try {
            if (!content) return null;

            const embedding = await this.getEmbedding(content);

            const memory = await Memory.create({
                content,
                embedding: embedding, // Sequelize JSON handles the array
                agentId: options.agentId || 'system',
                metadata: options.metadata || {},
                type: options.type || 'declarative'
            });

            logger.info(`Memory added: ${memory.id}`);
            return memory;
        } catch (error) {
            logger.error(`Failed to add memory: ${error.message}`);
            throw error;
        }
    }

    /**
     * Search for similar memories
     * @param {string} query 
     * @param {number} limit 
     * @param {number} minSimilarity 
     * @returns {Promise<Array>}
     */
    async searchMemory(query, limit = 5, minSimilarity = 0.7) {
        try {
            const queryEmbedding = await this.getEmbedding(query);
            if (!queryEmbedding) {
                logger.warn('Could not generate embedding for query, returning empty results');
                return [];
            }

            // 1. Fetch all memories (inefficient for large DBs, but fine for local agent PoC)
            // Ideally we'd use WHERE clauses to filter by agentId or type first
            const memories = await Memory.findAll({
                attributes: ['id', 'content', 'embedding', 'metadata', 'createdAt']
            });

            // 2. Compute similarities
            const scored = memories.map(mem => {
                if (!mem.embedding) {
                    logger.debug(`Memory ${mem.id} has no embedding`);
                    return { ...mem.toJSON(), score: 0 };
                }

                // Ensure embedding is an array (SQLite might return string if JSON type not handled perfectly)
                let vecB = mem.embedding;
                if (typeof vecB === 'string') {
                    try { vecB = JSON.parse(vecB); } catch (e) { vecB = []; }
                }

                const score = this.cosineSimilarity(queryEmbedding, vecB);
                logger.debug(`Memory ${mem.id} score: ${score}`);
                return {
                    ...mem.toJSON(),
                    score
                };
            });

            // 3. Filter and sort
            const results = scored
                .filter(m => m.score >= minSimilarity)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);

            return results;
        } catch (error) {
            logger.error(`Memory search failed: ${error.message}`);
            return [];
        }
    }
}

module.exports = new MemoryService();
