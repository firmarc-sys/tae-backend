const express = require('express');
const prisma = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ─── POST /api/tae/message ────────────────────────────────
router.post('/message', optionalAuth, async (req, res) => {
  try {
    const { message, gid } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    // Deduct tokens if authenticated real user
    if (req.userId && !req.userId.startsWith('demo-')) {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (user) {
        const tokensUsed = Math.ceil(message.length / 4); // rough token estimate
        if (user.tokens_used + tokensUsed > user.tokens_limit) {
          return res.status(429).json({
            error: 'Token limit exceeded',
            response: 'You have exceeded your token allocation. Please upgrade your plan.',
          });
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { tokens_used: { increment: tokensUsed } },
        });
      }
    }

    // TAE response — intelligent echo for now
    // TODO: integrate with OpenAI or custom LLM
    const response = generateTaeResponse(message);

    res.json({ response, gid });
  } catch (err) {
    console.error('TAE message error:', err);
    res.status(500).json({ error: 'TAE processing failed' });
  }
});

function generateTaeResponse(message) {
  const lower = message.toLowerCase();

  if (lower.includes('hello') || lower.includes('hi')) {
    return 'TAE online. Spatial Operating System ready. How can I assist you?';
  }
  if (lower.includes('status') || lower.includes('health')) {
    return 'All systems nominal. TAE Core: active. Render pipeline: standby. IoT mesh: listening. Syncori: synchronized.';
  }
  if (lower.includes('help')) {
    return 'Available modules: SYSTEM (core ops), RENDER (XR pipeline), TAE (intelligence), IoT (mesh network), SYNCORI (state sync). Ask about any module for details.';
  }
  if (lower.includes('system')) {
    return 'SYSTEM module: Core orchestration layer. CPU: 12%. Memory: 2.1GB/8GB. Uptime: 99.97%. All subsystems green.';
  }
  if (lower.includes('render')) {
    return 'RENDER module: XR pipeline ready. Supported: WebXR, ARKit, ARCore, Quest, Vision Pro. Spatial anchors: 0 active. Scene graph: idle.';
  }
  if (lower.includes('iot')) {
    return 'IoT module: Mesh network active. Connected devices: 0. Protocols: MQTT, WebSocket, BLE. Awaiting device pairing.';
  }
  if (lower.includes('syncori')) {
    return 'SYNCORI module: State synchronization engine. CRDT mode: active. Conflict resolution: last-writer-wins. Peers: 1 (self).';
  }
  if (lower.includes('plan') || lower.includes('upgrade') || lower.includes('subscribe')) {
    return 'Current allocation active. Use the Plans panel to view available tiers. Starter: $9.99/mo (50K tokens). Pro: $29.99/mo (500K tokens).';
  }

  return `Processing: "${message}"\nTAE acknowledges. Spatial context indexed. Use specific module commands for targeted operations.`;
}

module.exports = router;
