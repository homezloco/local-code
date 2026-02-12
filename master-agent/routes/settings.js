const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');

// Get all settings as a flat object
router.get('/', async (_req, res) => {
  try {
    const rows = await Setting.findAll();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single setting by key
router.get('/:key', async (req, res) => {
  try {
    const row = await Setting.findByPk(req.params.key);
    if (!row) return res.status(404).json({ error: `Setting "${req.params.key}" not found` });
    res.json({ key: row.key, value: row.value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save one or more settings (body is { key: value, key2: value2, ... })
router.post('/', async (req, res) => {
  try {
    const entries = req.body;
    if (!entries || typeof entries !== 'object') {
      return res.status(400).json({ error: 'Body must be a JSON object of key-value pairs' });
    }

    const saved = [];
    for (const [key, value] of Object.entries(entries)) {
      const [row] = await Setting.upsert({ key, value });
      saved.push({ key: row.key, value: row.value });
    }
    res.json({ saved: saved.length, settings: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a setting
router.delete('/:key', async (req, res) => {
  try {
    const deleted = await Setting.destroy({ where: { key: req.params.key } });
    res.json({ deleted: deleted > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
