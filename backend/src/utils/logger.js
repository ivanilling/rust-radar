const ts = () => new Date().toISOString().slice(11, 19);

const line = (level, icon, args) =>
  console.log(`[${ts()}] ${icon} [${level}]`, ...args);

const logger = {
  info: (...args) => line('info', 'ℹ️ ', args),
  ok: (...args) => line('ok ', '✅', args),
  warn: (...args) => line('warn', '⚠️ ', args),
  error: (...args) => line('err ', '❌', args),
  debug: (...args) => {
    if (process.env.DEBUG) line('debug', '🐛', args);
  },
};

export default logger;
