const express = require('express');
const router = express.Router();

const TEMPLATES = [
    { id: 't1', title: 'Refactor Code', description: 'Analyze the codebase and refactor the component for better performance.' },
    { id: 't2', title: 'Write Tests', description: 'Create unit and integration tests for the recently added features.' },
    { id: 't3', title: 'Security Audit', description: 'Scan for vulnerabilities and suggest security improvements.' },
    { id: 't4', title: 'Documentation', description: 'Update the README and inline documentation.' }
];

router.get('/', (req, res) => {
    res.json(TEMPLATES);
});

module.exports = router;
