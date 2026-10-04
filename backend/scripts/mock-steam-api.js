/**
 * Локальный мок Steam Web API (GetPlayerSummaries v2 + ResolveVanityURL v1)
 * для smoke-тестов без реального ключа. Запускается на 127.0.0.1.
 */
import http from 'node:http';

const KEY = 'mock-key';

/** Состояние игроков мока: steamId64 → { nickname, online, inRust, gameserverip? } */
export const steamState = new Map([
  ['76561198000000001', { nickname: 'Enemy Alpha', online: true, inRust: true }],
  ['76561198000000002', { nickname: 'Bravo Boy', online: false, inRust: false }],
  ['76561198000000003', { nickname: 'Charlie Chill', online: true, inRust: false }],
  [
    '76561198000000004',
    { nickname: 'Delta Tester', online: true, inRust: true, gameserverip: '127.0.0.1:39003' },
  ],
]);

export const vanityMap = new Map([
  ['enemyalpha', '76561198000000001'],
  ['bravoboy', '76561198000000002'],
  ['charlie', '76561198000000003'],
]);

export function setPlayer(steamId64, patch) {
  const cur = steamState.get(steamId64) || { nickname: 'Player ' + steamId64.slice(-4), online: false, inRust: false };
  steamState.set(steamId64, { ...cur, ...patch });
}

function profileFor(id) {
  const s = steamState.get(id) || { nickname: 'Unknown ' + id.slice(-4), online: false, inRust: false };
  const profile = {
    steamid: id,
    personaname: s.nickname,
    profileurl: `https://steamcommunity.com/profiles/${id}/`,
    personastate: s.online ? 1 : 0,
    lastlogoff: Math.floor(Date.now() / 1000) - 7200,
    avatarfull: `https://mock.local/avatars/${id}_full.jpg`,
    visible: true,
  };
  if (s.inRust) {
    profile.gameextrainfo = 'Rust';
    profile.gameid = '252490';
    // как у реального Steam: IP:порт сервера, где сидит игрок (для Rust отдаётся)
    profile.gameserverip = s.gameserverip || '127.0.0.1:39003';
  }
  return profile;
}

export function startMockSteamApi(port = 39001) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'application/json');

    if (url.searchParams.get('key') !== KEY) {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'mock: invalid key' }));
    }

    if (url.pathname === '/ISteamUser/GetPlayerSummaries/v2/') {
      const ids = (url.searchParams.get('steamids') || '').split(',').filter(Boolean);
      const players = ids.map(profileFor);
      res.writeHead(200);
      return res.end(JSON.stringify({ response: { players } }));
    }

    if (url.pathname === '/ISteamUser/ResolveVanityURL/v1/') {
      const vanity = (url.searchParams.get('vanityurl') || '').toLowerCase();
      const steamid = vanityMap.get(vanity);
      res.writeHead(200);
      return res.end(JSON.stringify({ response: { success: steamid ? 1 : 42, steamid } }));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'mock: unknown path', path: url.pathname }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject); // EADDRINUSE и прочее — наружу, а не крах процесса
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
