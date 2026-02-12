const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { URL } = require('url');

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB cap
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5; // per process global cap per minute

const blocklistHosts = [
  'localhost',
  '127.0.0.1',
  '::1',
  '169.254.169.254'
];

const blocklistCIDRs = [
  { base: '10.', len: 3 },
  { base: '192.168.', len: 8 },
  { base: '172.', len: 4, rangeStart: 16, rangeEnd: 31 }
];

let rateLimitState = { count: 0, windowStart: Date.now() };

function isBlockedHost(hostname) {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();
  if (blocklistHosts.includes(lower)) return true;

  // Simple IPv4 private range checks
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    if (lower.startsWith('10.')) return true;
    if (lower.startsWith('192.168.')) return true;
    if (lower.startsWith('172.')) {
      const second = Number(lower.split('.')[1]);
      if (second >= 16 && second <= 31) return true;
    }
  }
  return false;
}

function isAllowed(urlObj, allowlist, allowAll) {
  if (allowAll) return true;
  if (isBlockedHost(urlObj.hostname)) return false;
  if (!allowlist || allowlist.length === 0) return false;
  return allowlist.some((allowed) => allowed && urlObj.hostname.endsWith(allowed));
}

function checkRateLimit() {
  const now = Date.now();
  if (now - rateLimitState.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitState = { count: 0, windowStart: now };
  }
  if (rateLimitState.count >= RATE_LIMIT_MAX) {
    return false;
  }
  rateLimitState.count += 1;
  return true;
}

router.post('/fetch', async (req, res) => {
  const { url, allowlist = [], allowAll = false } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return res.status(400).json({ error: 'invalid url' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'only http/https allowed' });
  }

  if (isBlockedHost(parsed.hostname)) {
    return res.status(403).json({ error: 'blocked host' });
  }

  if (!isAllowed(parsed, allowlist, allowAll)) {
    return res.status(403).json({ error: 'not in allowlist' });
  }

  if (!checkRateLimit()) {
    return res.status(429).json({ error: 'rate limit exceeded' });
  }

  const client = parsed.protocol === 'https:' ? https : http;
  const options = {
    method: 'GET',
    headers: {
      'User-Agent': 'LocalAgent/1.0'
    },
    timeout: REQUEST_TIMEOUT_MS
  };

  const chunks = [];
  let bytes = 0;

  const request = client.get(parsed, options, (response) => {
    response.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        request.destroy();
        return res.status(413).json({ error: 'response too large', maxBytes: MAX_BODY_BYTES });
      }
      chunks.push(chunk);
    });

    response.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      res.json({
        status: response.statusCode,
        headers: response.headers,
        body
      });
    });
  });

  request.on('timeout', () => {
    request.destroy();
    res.status(504).json({ error: 'fetch timeout', timeoutMs: REQUEST_TIMEOUT_MS });
  });

  request.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

module.exports = router;
