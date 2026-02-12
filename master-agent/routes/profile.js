const express = require('express');
const MasterProfile = require('../models/MasterProfile');

const router = express.Router();

// Get master profile (first / latest)
router.get('/', async (_req, res) => {
  try {
    const profile = await MasterProfile.findOne({ order: [['createdAt', 'ASC']] });
    if (!profile) return res.status(404).json({ error: 'Master profile not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load profile' });
  }
});

// Upsert master profile
router.put('/', async (req, res) => {
  try {
    const { name, displayName, persona, traits, variables } = req.body || {};
    if (!name || !displayName) return res.status(400).json({ error: 'name and displayName are required' });

    let profile = await MasterProfile.findOne({ order: [['createdAt', 'ASC']] });
    if (!profile) {
      profile = await MasterProfile.create({ name, displayName, persona, traits, variables });
    } else {
      await profile.update({ name, displayName, persona, traits, variables });
    }
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to save profile' });
  }
});

module.exports = router;
