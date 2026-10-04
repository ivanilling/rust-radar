import 'dotenv/config';

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const env = {
  port: num(process.env.PORT, 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',

  mongoUri: process.env.MONGO_URI || '',

  steamApiKey: process.env.STEAM_API_KEY || '',
  steamApiBase: process.env.STEAM_API_BASE || 'https://api.steampowered.com',
  rustAppId: String(process.env.RUST_APP_ID || '252490'),

  trackIntervalMs: num(process.env.TRACK_INTERVAL_MS, 60000),
  // пока кто-то из отслеживаемых в игре — опрашиваем быстрее
  trackFastIntervalMs: num(process.env.TRACK_FAST_INTERVAL_MS, 20000),
  a2sTimeoutMs: num(process.env.A2S_TIMEOUT_MS, 8000),
  trackOnBoot: process.env.TRACK_ON_BOOT !== 'false',

  // Telegram-бот (опционально: без токена функции бота отключены)
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
};

export default env;
