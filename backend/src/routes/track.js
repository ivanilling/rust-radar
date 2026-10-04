import { Router } from 'express';
import { runOnce } from '../services/trackerService.js';
import { onPlayerEvent } from '../services/eventBus.js';
import env from '../config/env.js';

const router = Router();

/** GET /api/track/events — SSE-поток событий в реальном времени (вход/выход/смена сервера). */
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('data: {"type":"hello"}\n\n');

  const off = onPlayerEvent((payload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      /* соединение уже мертво */
    }
  });
  const heartbeat = setInterval(() => {
    try {
      res.write(': hb\n\n');
    } catch {
      /* ignore */
    }
  }, 25000);

  req.on('close', () => {
    off();
    clearInterval(heartbeat);
  });
});

/** POST /api/track/run — принудительный цикл скана (без ожидания интервала). */
router.post('/run', async (req, res, next) => {
  try {
    const result = await runOnce();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** GET /api/track/status — конфигурация трекера. */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      intervalMs: env.trackIntervalMs,
      steamApiConfigured: Boolean(env.steamApiKey),
      rustAppId: env.rustAppId,
    },
  });
});

export default router;
