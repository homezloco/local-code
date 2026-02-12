const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Task = require('../models/Task');
const TaskDelegation = require('../models/TaskDelegation');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const BLOCKED_PATTERNS = [
  /\.\./, // directory traversal
  /node_modules/,
  /\.git\//,
  /\.env/,
  /secrets/i,
  /password/i,
];

function isPathSafe(filePath) {
  const resolved = path.resolve(PROJECT_ROOT, filePath);
  if (!resolved.startsWith(PROJECT_ROOT)) return false;
  return !BLOCKED_PATTERNS.some((p) => p.test(filePath));
}

// Preview code from a delegation result
router.get('/preview/:delegationId', async (req, res) => {
  try {
    const delegation = await TaskDelegation.findByPk(req.params.delegationId);
    if (!delegation) return res.status(404).json({ error: 'Delegation not found' });

    const result = delegation.result || {};
    const raw = result.plan || '';

    let parsed = null;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      // not structured JSON — return raw text
    }

    if (parsed?.files && Array.isArray(parsed.files)) {
      const files = parsed.files.map((f) => ({
        path: f.path,
        action: f.action || 'create',
        language: f.language || 'text',
        content: f.content || '',
        description: f.description || '',
        safe: isPathSafe(f.path),
        exists: isPathSafe(f.path) && fs.existsSync(path.resolve(PROJECT_ROOT, f.path)),
      }));

      return res.json({
        structured: true,
        summary: parsed.summary || '',
        files,
        testStrategy: parsed.testStrategy || '',
        risks: parsed.risks || '',
        delegationId: delegation.id,
        taskId: delegation.taskId,
      });
    }

    res.json({
      structured: false,
      raw,
      delegationId: delegation.id,
      taskId: delegation.taskId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply a single file from a delegation result
router.post('/apply', async (req, res) => {
  try {
    const { delegationId, fileIndex } = req.body;
    if (!delegationId) return res.status(400).json({ error: 'delegationId is required' });

    const delegation = await TaskDelegation.findByPk(delegationId);
    if (!delegation) return res.status(404).json({ error: 'Delegation not found' });

    const result = delegation.result || {};
    const raw = result.plan || '';

    let parsed = null;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return res.status(400).json({ error: 'Delegation result is not structured code' });
    }

    if (!parsed?.files || !Array.isArray(parsed.files)) {
      return res.status(400).json({ error: 'No files found in delegation result' });
    }

    const idx = fileIndex != null ? fileIndex : 0;
    const file = parsed.files[idx];
    if (!file) return res.status(400).json({ error: `File index ${idx} not found` });

    if (!isPathSafe(file.path)) {
      return res.status(403).json({ error: `Path "${file.path}" is not allowed` });
    }

    const fullPath = path.resolve(PROJECT_ROOT, file.path);

    if (file.action === 'delete') {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return res.json({ applied: true, action: 'deleted', path: file.path });
      }
      return res.json({ applied: false, action: 'delete', path: file.path, reason: 'File does not exist' });
    }

    // Create parent directories if needed
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Backup existing file
    let backup = null;
    if (fs.existsSync(fullPath)) {
      backup = fs.readFileSync(fullPath, 'utf-8');
    }

    fs.writeFileSync(fullPath, file.content, 'utf-8');

    // Update delegation metadata with applied files
    const appliedFiles = delegation.result?.appliedFiles || [];
    appliedFiles.push({
      path: file.path,
      action: file.action || 'create',
      appliedAt: new Date().toISOString(),
      hadBackup: backup !== null,
    });
    await delegation.update({
      result: { ...delegation.result, appliedFiles }
    });

    res.json({
      applied: true,
      action: file.action || 'create',
      path: file.path,
      fullPath,
      hadBackup: backup !== null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply all files from a delegation result
router.post('/apply-all', async (req, res) => {
  try {
    const { delegationId } = req.body;
    if (!delegationId) return res.status(400).json({ error: 'delegationId is required' });

    const delegation = await TaskDelegation.findByPk(delegationId);
    if (!delegation) return res.status(404).json({ error: 'Delegation not found' });

    const result = delegation.result || {};
    const raw = result.plan || '';

    let parsed = null;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return res.status(400).json({ error: 'Delegation result is not structured code' });
    }

    if (!parsed?.files || !Array.isArray(parsed.files)) {
      return res.status(400).json({ error: 'No files found in delegation result' });
    }

    const results = [];
    for (const file of parsed.files) {
      if (!isPathSafe(file.path)) {
        results.push({ path: file.path, applied: false, reason: 'Path not allowed' });
        continue;
      }

      const fullPath = path.resolve(PROJECT_ROOT, file.path);

      if (file.action === 'delete') {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          results.push({ path: file.path, applied: true, action: 'deleted' });
        } else {
          results.push({ path: file.path, applied: false, reason: 'File does not exist' });
        }
        continue;
      }

      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, file.content, 'utf-8');
      results.push({ path: file.path, applied: true, action: file.action || 'create' });
    }

    res.json({ applied: results.filter((r) => r.applied).length, total: parsed.files.length, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send code to VS Code extension for diff view
router.post('/open-in-vscode', async (req, res) => {
  try {
    const { filePath, content } = req.body;
    if (!filePath || !content) {
      return res.status(400).json({ error: 'filePath and content are required' });
    }

    const fullPath = path.resolve(PROJECT_ROOT, filePath);

    // Try to open via VS Code CLI
    const { exec } = require('child_process');
    
    // Write to a temp file for diff comparison
    const tempDir = path.join(PROJECT_ROOT, '.tmp-agent');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, path.basename(filePath) + '.proposed');
    fs.writeFileSync(tempFile, content, 'utf-8');

    if (fs.existsSync(fullPath)) {
      // Open diff view
      exec(`code --diff "${fullPath}" "${tempFile}"`, (err) => {
        if (err) {
          return res.json({ opened: false, error: err.message, tempFile });
        }
        res.json({ opened: true, mode: 'diff', original: fullPath, proposed: tempFile });
      });
    } else {
      // Open new file
      exec(`code "${tempFile}"`, (err) => {
        if (err) {
          return res.json({ opened: false, error: err.message, tempFile });
        }
        res.json({ opened: true, mode: 'new', proposed: tempFile });
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
