/**
 * Smoke-тест backend'а end-to-end (без реальных внешних сервисов):
 *  - мок Steam Web API (HTTP) на 127.0.0.1:39001
 *  - мок Rust-сервера (UDP A2S) на 127.0.0.1:39003
 *  - MongoDB in-memory
 *  - REST API + полный цикл trackerService (Steam-опрос + A2S-скан + сессии + история)
 * Запуск: npm run smoke
 */
process.env.NODE_ENV = 'development';
process.env.PORT = '39002';
process.env.MONGO_URI = '';
process.env.STEAM_API_KEY = 'mock-key';
process.env.STEAM_API_BASE = 'http://127.0.0.1:39001';
process.env.TRACK_ON_BOOT = 'false';
process.env.TRACK_INTERVAL_MS = '60000';
process.env.SESSION_SECRET = 'smoke-secret';
process.env.APP_URL = 'http://127.0.0.1:39002';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

const { startMockSteamApi, steamState, setPlayer } = await import('./mock-steam-api.js');
const { startMockRustServer, mockServerState, removePlayer } = await import('./mock-rust-server.js');
const { connectDB, shutdownDB } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { runOnce } = await import('../src/services/trackerService.js');
const { onPlayerEvent } = await import('../src/services/eventBus.js');
const Player = (await import('../src/models/Player.js')).default;
const TrackingSession = (await import('../src/models/TrackingSession.js')).default;

// собираем события шины (то, что уходит на сайт по SSE)
const sseEvents = [];
const offBus = onPlayerEvent((e) => sseEvents.push(e));

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

const A1 = '76561198000000001'; // Enemy Alpha: онлайн, в Rust, сидит на мок-сервере (A2S)
const A2 = '76561198000000002'; // Bravo Boy: офлайн в Steam, но сидит на сервере
const A3 = '76561198000000003'; // Charlie: онлайн, не в Rust
const A4 = '76561198000000004'; // Delta: в Rust, сервер известен только по gameserverip (нет в A2S-скане)

const steamSrv = await startMockSteamApi(39001);
const rustSock = await startMockRustServer(39003);
await connectDB();

const app = createApp();
const httpSrv = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${httpSrv.address().port}`;

const api = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

try {
  console.log('\n=== 1. Базовые эндпоинты ===');
  const health = await api('GET', '/api/health');
  check('GET /api/health → ok', health.status === 200 && health.json?.status === 'ok');

  const status = await api('GET', '/api/track/status');
  check('GET /api/track/status: steam key настроен', status.json?.data?.steamApiConfigured === true);
  check('GET /api/track/status: интервал 60с', status.json?.data?.intervalMs === 60000);

  console.log('\n=== 2. Watchlist: добавление игроков ===');
  const p1 = await api('POST', '/api/players', { steamIdOrUrl: A1 });
  check('POST /api/players (чистый SteamID64) → 201', p1.status === 201 && p1.json?.data?.steamId64 === A1);
  check('  ник подтянут из Steam: Enemy Alpha', p1.json?.data?.nickname === 'Enemy Alpha', JSON.stringify(p1.json));

  const p2 = await api('POST', '/api/players', { steamIdOrUrl: 'https://steamcommunity.com/id/bravoboy/' });
  check('POST /api/players (vanity-URL) → 201', p2.status === 201 && p2.json?.data?.steamId64 === A2, JSON.stringify(p2.json));

  const p3 = await api('POST', '/api/players', { steamIdOrUrl: A3 });
  check('POST /api/players (Charlie) → 201', p3.status === 201);

  const p4 = await api('POST', '/api/players', { steamIdOrUrl: A4 });
  check('POST /api/players (Delta, сервер известен только Steam) → 201', p4.status === 201);

  const dup = await api('POST', '/api/players', { steamIdOrUrl: A1 });
  const total = await Player.countDocuments();
  check('Повторное добавление не создаёт дубликат', dup.status === 201 && total === 4, `total=${total}`);

  const bad = await api('POST', '/api/players', { steamIdOrUrl: 'not a steam id!' });
  check('Мусорный ввод → 400', bad.status === 400);

  console.log('\n=== 3. Серверы: добавление с живой A2S-проверкой ===');
  const s1 = await api('POST', '/api/servers', { host: '127.0.0.1', port: 39003 });
  check('POST /api/servers → 201', s1.status === 201);
  check('  сервер откликнулся на A2S при добавлении', s1.json?.data?.probed === true, JSON.stringify(s1.json));
  check('  имя с сервера прочитано', String(s1.json?.data?.name || '').includes('Mock Rust'), s1.json?.data?.name);

  console.log('\n=== 4. Цикл трекера: Steam-опрос + A2S-скан ===');
  const run1 = await api('POST', '/api/track/run');
  check('POST /api/track/run → ok', run1.status === 200 && run1.json?.data?.ok === true, JSON.stringify(run1.json));
  check('  Steam проверил 4 игроков', run1.json?.data?.steamChecked === 4, JSON.stringify(run1.json?.data));
  check('  1 сервер онлайн', run1.json?.data?.serversOnline === 1);
  check('  2 врага найдены через A2S', run1.json?.data?.foundOnServers === 2, JSON.stringify(run1.json?.data));

  const list1 = (await api('GET', '/api/players')).json.data;
  const alpha = list1.find((p) => p.steamId64 === A1);
  const bravo = list1.find((p) => p.steamId64 === A2);
  const charlie = list1.find((p) => p.steamId64 === A3);
  const delta = list1.find((p) => p.steamId64 === A4);
  check('Alpha: онлайн в Steam', alpha?.isOnline === true);
  check('Alpha: в Rust', alpha?.isInRust === true);
  check('Alpha: currentServer = мок-сервер', String(alpha?.currentServer?.name || '').includes('Mock Rust'), JSON.stringify(alpha?.currentServer));
  check('Alpha: matchedBy=nickname (A2S не отдаёт SteamID)', alpha?.currentServer?.matchedBy === 'nickname', alpha?.currentServer?.matchedBy);
  check('Bravo: офлайн в Steam', bravo?.isOnline === false);
  check('Bravo: найден на сервере, хоть Steam и офлайн', !!bravo?.currentServer, JSON.stringify(bravo?.currentServer));
  check('Charlie: не на сервере, не в Rust', !charlie?.currentServer && charlie?.isInRust === false);
  check('Delta: в Rust', delta?.isInRust === true);
  check('Delta: сервер определён по gameserverip (A2S его не сканировал)', delta?.currentServer?.matchedBy === 'gameserverip', JSON.stringify(delta?.currentServer));
  check('Delta: имя сервера = ip:port (кэша имён в смоуке нет)', delta?.currentServer?.name === '127.0.0.1:39003', delta?.currentServer?.name);
  check(
    'SSE: события enter ушли в шину (Alpha через A2S + Delta через gameserverip)',
    sseEvents.filter((e) => e.event === 'enter').length >= 2,
    JSON.stringify(sseEvents.map((e) => e.event + ':' + (e.player?.nickname || '?')))
  );

  console.log('\n=== 5. Сессии и история онлайна ===');
  const det = (await api('GET', `/api/players/${A1}`)).json.data;
  const steamSession = det.sessions.find((s) => s.source === 'steam');
  const a2sSession = det.sessions.find((s) => s.source === 'a2s');
  check('Открыта steam-сессия (запущена Rust)', steamSession?.isActive === true);
  check('Открыта a2s-сессия с названием сервера', a2sSession?.isActive === true && String(a2sSession?.server?.name || '').includes('Mock Rust'), JSON.stringify(a2sSession));
  check('История онлайна пишется (1 снапшот)', det.player.onlineHistory?.length === 1, JSON.stringify(det.player.onlineHistory));
  check('Снапшот: online=true, inRust=true, onServer=true', (() => {
    const s = det.player.onlineHistory?.[0];
    return s?.online === true && s?.inRust === true && s?.onServer === true;
  })());

  const det3 = (await api('GET', `/api/players/${A3}`)).json.data;
  check('Charlie: без открытых сессий', det3.sessions.filter((s) => s.isActive).length === 0);

  const det4 = (await api('GET', `/api/players/${A4}`)).json.data;
  check(
    'Delta: открыта gameserverip-сессия с сервером',
    det4.sessions.some((s) => s.source === 'gameserverip' && s.isActive && s.server?.port === 39003),
    JSON.stringify(det4.sessions)
  );

  console.log('\n=== 6. Изменение состояния: Alpha вышел из игры ===');
  setPlayer(A1, { inRust: false });
  removePlayer('Enemy Alpha'); // и с сервера тоже
  setPlayer(A4, { inRust: false }); // Delta тоже вышел
  await new Promise((r) => setTimeout(r, 300));
  const run2 = await api('POST', '/api/track/run');
  check('Второй цикл ok', run2.status === 200 && run2.json?.data?.ok === true);

  const det2 = (await api('GET', `/api/players/${A1}`)).json.data;
  const closedSteam = det2.sessions.find((s) => s.source === 'steam');
  const closedA2s = det2.sessions.find((s) => s.source === 'a2s');
  check('Steam-сессия закрыта', closedSteam?.isActive === false, JSON.stringify(closedSteam));
  check('  с durationMinutes >= 0', typeof closedSteam?.durationMinutes === 'number');
  check('A2S-сессия закрыта', closedA2s?.isActive === false);
  check('currentServer сброшен', det2.player.currentServer === null, JSON.stringify(det2.player.currentServer));
  check('История выросла до 2 снапшотов', det2.player.onlineHistory?.length === 2);
  check('Последний снапшот: inRust=false, onServer=false', (() => {
    const s = det2.player.onlineHistory?.at(-1);
    return s?.inRust === false && s?.onServer === false;
  })());

  const list2 = (await api('GET', '/api/players')).json.data;
  const bravo2 = list2.find((p) => p.steamId64 === A2);
  check('Bravo всё ещё на сервере (его не убирали)', !!bravo2?.currentServer);

  const det4b = (await api('GET', `/api/players/${A4}`)).json.data;
  check('Delta: gameserverip-сессия закрыта', det4b.sessions.filter((s) => s.source === 'gameserverip').every((s) => !s.isActive), JSON.stringify(det4b.sessions));
  check('Delta: currentServer сброшен', det4b.player.currentServer === null, JSON.stringify(det4b.player.currentServer));
  check('SSE: события exit зафиксированы', sseEvents.some((e) => e.event === 'exit'), JSON.stringify(sseEvents.map((e) => e.event)));

  console.log('\n=== 7. История сессий и агрегаты ===');
  const stat = det2.stats;
  check('Агрегат steam: есть закрытые сессии', typeof stat?.steam?.sessions === 'number' && stat.steam.sessions >= 1, JSON.stringify(stat));
  check('Агрегат a2s: есть закрытые сессии', typeof stat?.a2s?.sessions === 'number' && stat.a2s.sessions >= 1);

  console.log('\n=== 8. Удаление из watchlist ===');
  const del = await api('DELETE', `/api/players/${A3}`);
  check('DELETE → ok', del.status === 200 && del.json?.data?.removed === true);
  const list3 = (await api('GET', '/api/players')).json.data;
  check('В списке осталось 3 игрока', list3.length === 3, `len=${list3.length}`);
  const stillInDb = await Player.countDocuments({ steamId64: A3 });
  check('Документ сохранён (active=false), история не потеряна', stillInDb === 1);

  console.log('\n=== 9. Open sessions в БД соответствуют реальности ===');
  const openSessions = await TrackingSession.find({ isActive: true });
  check('Открыта только a2s-сессия Bravo', openSessions.length === 1 && openSessions[0].steamId64 === A2, JSON.stringify(openSessions.map((s) => s.steamId64 + ':' + s.source)));
} catch (err) {
  failed++;
  console.error('❌ ИСКЛЮЧЕНИЕ В СМОУК-ТЕСТЕ:', err);
  } finally {
    offBus();
    console.log(`\n────────────────────────────`);
  console.log(`ПРОЙДЕНО: ${passed}  ПРОВАЛЕНО: ${failed}`);
  console.log(`────────────────────────────`);

  try { await shutdownDB(); } catch {}
  try { steamSrv.close(); } catch {}
  try { rustSock.close(); } catch {}
  try { httpSrv.close(); } catch {}
  process.exit(failed > 0 ? 1 : 0);
}
