import { Router } from 'express';
import authRoutes from './auth.js';
import playerRoutes from './players.js';
import serverRoutes from './servers.js';
import trackRoutes from './track.js';
import telegramRoutes from './telegram.js';

const router = Router();

router.get('/health', (req, res) =>
  res.json({ success: true, status: 'ok', time: new Date().toISOString() })
);

router.use('/auth', authRoutes);
router.use('/players', playerRoutes);
router.use('/servers', serverRoutes);
router.use('/track', trackRoutes);
router.use('/telegram', telegramRoutes);

export default router;
