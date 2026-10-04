import crypto from 'node:crypto';
import { Router } from 'express';
import { getBotUsername, isEnabled } from '../services/telegramService.js';

const router = Router();

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Нужен вход через Steam' });
  }
  next();
}

/** GET /api/telegram/status — привязан ли аккаунт + код для привязки. */
router.get('/status', requireAuth, (req, res) => {
  const active = req.user.tgLinkCode && req.user.tgLinkCodeExpires > new Date();
  res.json({
    success: true,
    data: {
      botEnabled: isEnabled(),
      botUsername: getBotUsername(),
      linked: Boolean(req.user.telegramChatId),
      telegramUsername: req.user.telegramUsername,
      linkCode: active ? req.user.tgLinkCode : null,
      linkExpiresAt: active ? req.user.tgLinkCodeExpires : null,
    },
  });
});

/** POST /api/telegram/link — сгенерировать одноразовый код привязки (10 минут). */
router.post('/link', requireAuth, (req, res) => {
  const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 символов
  req.user.tgLinkCode = code;
  req.user.tgLinkCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
  req.user.save().then(() =>
    res.json({
      success: true,
      data: {
        code,
        botUsername: getBotUsername(),
        expiresAt: req.user.tgLinkCodeExpires,
      },
    })
  );
});

export default router;
