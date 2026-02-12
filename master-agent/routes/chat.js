const express = require('express');
const axios = require('axios');
const ChatLog = require('../models/ChatLog');
const PlanLog = require('../models/PlanLog');

const router = express.Router();

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:7788';
const CHAT_LIMIT = Number(process.env.CHAT_HISTORY_LIMIT || 2000);

const sanitizeText = (text) => (typeof text === 'string' ? text : JSON.stringify(text || ''));

router.get('/history', async (req, res) => {
  try {
    const { taskId, limit } = req.query;
    const where = {};
    if (taskId) where.taskId = taskId;
    const rows = await ChatLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit) || 50
    });
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load chat history' });
  }
});

// Non-streaming chat (plan/codegen) with persistence
router.post('/', async (req, res) => {
  const startedAt = Date.now();
  try {
    const { message, mode = 'plan', taskId, agentName, useRAG = true, k = 6, model, provider, apiKey, endpoint, selection, patchMode } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const target = mode === 'codegen' ? '/codegen' : '/plan';
    const basePrompt = selection ? `${message}\n\nSelection:\n${selection}` : message;
    const prompt = patchMode && mode === 'codegen'
      ? `${basePrompt}\n\nReturn a unified diff (patch) when applicable. If uncertain, include narrative steps.`
      : basePrompt;

    const payload = {
      prompt,
      question: prompt,
      task: prompt,
      context: { useRAG, k },
      model,
      provider,
      apiKey,
      endpoint
    };

    const response = await axios.post(`${AGENT_SERVICE_URL}${target}`, payload, { timeout: 120_000 });
    const endAt = Date.now();

    const body = response?.data || {};
    const text = mode === 'codegen' ? body.code || body.response || '' : body.plan || body.response || '';
    const meta = {
      mode,
      model: body.modelTried || model,
      fallback: body.fallbackTried || null,
      provider: body.provider || provider,
      useRAG,
      k,
      patchMode,
      durationMs: endAt - startedAt,
      ragError: body.ragError,
      contextCount: Array.isArray(body.context) ? body.context.length : undefined
    };

    try {
      await Promise.all([
        ChatLog.create({
          taskId: taskId || null,
          agentName: agentName || null,
          userMessage: prompt,
          responseText: text,
          meta
        }),
        PlanLog.create({
          taskId: taskId || null,
          agentName: agentName || null,
          mode,
          prompt,
          responseText: text,
          meta
        })
      ]);
    } catch (persistErr) {
      console.error('Chat/Plan persist error:', persistErr?.message || persistErr);
    }

    return res.json({ text, meta });
  } catch (error) {
    const endAt = Date.now();
    console.error('Chat error:', error?.message || error);
    return res.status(502).json({ error: 'Chat failed', detail: error?.message || String(error), durationMs: endAt - startedAt });
  }
});

router.post('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const close = () => {
    try {
      res.end();
    } catch (_) {
      /* noop */
    }
  };

  try {
    const startedAt = Date.now();
    const { message, mode = 'plan', taskId, agentName, useRAG = true, k = 6, model, provider, apiKey, endpoint, selection, patchMode } = req.body || {};
    if (!message || typeof message !== 'string') {
      sendEvent('error', { message: 'message is required' });
      return close();
    }

    const target = mode === 'codegen' ? '/codegen/stream' : '/plan/stream';

    // Build prompt; if patchMode requested, ask for unified diff
    const basePrompt = selection ? `${message}\n\nSelection:\n${selection}` : message;
    const prompt = patchMode && mode === 'codegen'
      ? `${basePrompt}\n\nReturn a unified diff (patch) when applicable. If uncertain, include narrative steps.`
      : basePrompt;

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const agentStream = await axios.post(
      `${AGENT_SERVICE_URL}${target}`,
      {
        prompt,
        question: prompt,
        task: prompt,
        context: { useRAG, k },
        model,
        provider,
        apiKey,
        endpoint
      },
      {
        responseType: 'stream',
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
        timeout: 0
      }
    );

    let buffer = '';
    let finalText = '';
    let modelUsed = model;
    let fallbackUsed = null;

    agentStream.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const lines = part.split('\n');
        let eventName = 'message';
        let dataLine = '';
        lines.forEach((line) => {
          if (line.startsWith('event:')) eventName = line.replace('event:', '').trim();
          if (line.startsWith('data:')) dataLine = line.replace('data:', '').trim();
        });
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine);
          if (eventName === 'token') {
            const token = sanitizeText(payload.text || '');
            finalText += token;
            sendEvent('token', { text: token });
          } else if (eventName === 'done') {
            finalText = payload.text || finalText;
            modelUsed = payload.model || modelUsed;
            fallbackUsed = payload.fallback ?? fallbackUsed;
            sendEvent('done', { text: finalText, model: modelUsed, fallback: fallbackUsed, provider: payload.provider });
            close();
          } else if (eventName === 'error') {
            sendEvent('error', payload);
            close();
          } else if (eventName === 'warn') {
            sendEvent('warn', payload);
          }
        } catch (_) {
          // ignore parse errors
        }
      }
    });

    agentStream.data.on('end', async () => {
      try {
        const meta = {
          mode,
          model: modelUsed,
          fallback: fallbackUsed,
          provider,
          useRAG,
          k,
          patchMode,
          durationMs: Date.now() - startedAt
        };
        await Promise.all([
          ChatLog.create({
            taskId: taskId || null,
            agentName: agentName || null,
            userMessage: prompt,
            responseText: finalText,
            meta
          }),
          PlanLog.create({
            taskId: taskId || null,
            agentName: agentName || null,
            mode,
            prompt,
            responseText: finalText,
            meta
          })
        ]);
        // Optional cap
        const count = await ChatLog.count();
        if (count > CHAT_LIMIT) {
          const excess = count - CHAT_LIMIT;
          const oldRows = await ChatLog.findAll({
            order: [['createdAt', 'ASC']],
            limit: excess
          });
          const ids = oldRows.map((r) => r.id);
          if (ids.length) await ChatLog.destroy({ where: { id: ids } });
        }
      } catch (err) {
        // non-blocking
        console.error('ChatLog persist error:', err?.message || err);
      }
      if (finalText) return; // already closed
      close();
    });

    agentStream.data.on('error', (err) => {
      sendEvent('error', { message: err?.message || String(err) });
      close();
    });
  } catch (error) {
    sendEvent('error', { message: error?.message || 'Chat failed' });
    close();
  }
});

module.exports = router;
