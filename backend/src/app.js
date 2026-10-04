import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import env from './config/env.js';
import { configurePassport } from './config/passport.js';
import routes from './routes/index.js';
import logger from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json());

  // сессии: если MongoDB подключена — храним их В БАЗЕ (вход переживает
  // перезапуски бэкенда и засыпание бесплатных хостингов)
  const sessionConfig = {
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30, // вход живёт 30 дней
    },
  };
  if (mongoose.connection.readyState === 1) {
    sessionConfig.store = MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: 'sessions',
      stringify: false,
    });
  }
  app.use(session(sessionConfig));

  const passport = configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/api', routes);

  // production-деплой на VPS: раздаём собранный фронтенд (frontend/dist) тем же
  // процессом — единый origin, никаких CORS и прокси
  const distDir = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
    logger.info('Раздаю собранный фронтенд из frontend/dist');
  }

  app.use((req, res) => res.status(404).json({ success: false, error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  });

  return app;
}
