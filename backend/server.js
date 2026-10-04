import env from './src/config/env.js';
import logger from './src/utils/logger.js';
import { connectDB } from './src/config/db.js';
import { createApp } from './src/app.js';
import { startTracker } from './src/services/trackerService.js';
import { startNameCacheRefresher } from './src/services/serverNameService.js';
import { startTelegramPolling } from './src/services/telegramService.js';

async function main() {
  logger.info('Rust Radar backend запускается…');
  await connectDB();
  startNameCacheRefresher(); // кэш имён серверов для метода gameserverip
  startTelegramPolling(); // TG-бот (если задан TELEGRAM_BOT_TOKEN)

  const app = createApp();
  const server = app.listen(env.port, () =>
    logger.ok(`API слушает http://localhost:${env.port}`)
  );

  startTracker();

  const shutdown = (signal) => {
    logger.warn(`${signal} — останавливаюсь…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Фатальная ошибка старта:', err.message);
  process.exit(1);
});
