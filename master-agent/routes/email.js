const express = require('express');
const router = express.Router();
const { EmailAgent } = require('../plugins/EmailAgent');

// Initialize email agent
const emailAgent = new EmailAgent();

// Send email
router.post('/send', async (req, res) => {
  try {
    const result = await emailAgent.sendEmail(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read emails (placeholder)
router.get('/inbox', async (req, res) => {
  try {
    const emails = await emailAgent.readEmails(req.query);
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule meeting
router.post('/schedule-meeting', async (req, res) => {
  try {
    const result = await emailAgent.scheduleMeeting(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
