/**
 * ДЕМО-режим без реальных ключей и сети:
 *  - поднимает мок Steam Web API (порт 39001) и мок Rust-сервера (порт 39003);
 *  - запускает обычный бэкенд на PORT (по умолчанию 3001);
 *  - автоматически добавляет трёх тестовых врагов и мок-сервер, прогоняет скан.
 * Запуск: npm run demo
 */
process.env.NODE_ENV = 'development';
process.env.PORT = process.env.PORT || '3001';
process.env.TRACK_ON_BOOT = 'false';
process.env.STEAM_API_KEY = 'mock-key';
process.env.STEAM_API_BASE = 'http://127.0.0.1:39001';

const { startMockSteamApi, setPlayer } = await import('./mock-steam-api.js');
const { startMockRustServer } = await import('./mock-rust-server.js');

async function startMockSafe(label, fn) {
  try {
    await fn();
    console.log(`[demo] ${label} запущен`);
  } catch (err) {
    if (err?.code === 'EADDRINUSE') {
      console.log(`[demo] ${label} уже работает — использую существующий`);
    } else {
      throw err;
    }
  }
}

await startMockSafe('Мок Steam API (:39001)', () => startMockSteamApi(39001));
await startMockSafe('Мок Rust-сервер (:39003)', () => startMockRustServer(39003));

const PORT = process.env.PORT || '3001';
const BASE = `http://127.0.0.1:${PORT}`;

// если бэкенд уже работает на этом порту — не запускаем второй, просто подсеиваем данные
async function isApiUp() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

if (await isApiUp()) {
  console.log(`[demo] бэкенд уже работает на :${PORT} — подключаюсь к нему`);
} else {
  await import('../server.js'); // поднимает API и трекер
}

// сид данных через HTTP API — работает и для своего, и для уже запущенного бэкенда
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
}

async function seed() {
  try {
    if (!(await isApiUp())) return; // бэкенд ещё поднимается
    const list = await api('GET', '/api/players');
    if ((list?.data?.length || 0) === 0) {
      for (const id of ['76561198000000001', '76561198000000002', '76561198000000003']) {
        await api('POST', '/api/players', { steamIdOrUrl: id });
      }
      const servers = await api('GET', '/api/servers');
      if ((servers?.data?.length || 0) === 0) {
        await api('POST', '/api/servers', { host: '127.0.0.1', port: 39003 });
      }
      await api('POST', '/api/track/run');
      console.log('[demo] ✔ добавлены 3 тестовых врага и мок-сервер — смотри радар на http://localhost:5173');
    }
  } catch (err) {
    console.log('[demo] сид пропущен:', err.message);
  }
}
setTimeout(seed, 2500);
setInterval(seed, 15000);

// держим процесс живым, даже если бэкенд внешний (моки должны работать)
setInterval(() => {}, 1 << 30);
