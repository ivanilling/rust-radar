import { GameDig } from 'gamedig';
import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * A2S-сканер на базе gamedig.
 * Опрашивает Rust-сервер по host:port (UDP, протокол A2S_INFO + A2S_PLAYER)
 * и сопоставляет игроков сервера с watchlist по SteamID64 или нику.
 */

/** Запрос одного сервера. Бросает исключение при недоступности. */
export async function queryServer({ host, port }) {
  const state = await GameDig.query({
    type: 'rust',
    host,
    port,
    givenPortOnly: true, // не даём gamedig подбирать порты со смещением
    socketTimeout: env.a2sTimeoutMs,
    maxRetries: 2,
  });

  return {
    name: state.name || '',
    map: state.map || '',
    playersCount: state.numplayers ?? (state.players ? state.players.length : 0),
    maxPlayers: state.maxplayers ?? 0,
    players: (state.players || []).map((p) => ({
      // gamedig для Rust кладёт steamid в raw (8-байтовое расширение A2S_PLAYER от Facepunch)
      name: p.name || '',
      steamId64: p.raw?.steamid ?? p.steamid ?? null,
      score: p.raw?.score ?? null,
      duration: p.raw?.time ?? null,
    })),
  };
}

export const normalizeNickname = (name) =>
  String(name || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Сопоставление игроков сервера со watchlist.
 * Приоритет — SteamID64 (если сервер отдаёт расширение A2S_PLAYER),
 * фоллбэк — точное совпадение ника (помечается matchedBy: 'nickname').
 */
export function matchPlayers(serverPlayers, watchPlayers) {
  const bySteamId = new Map();
  const byNickname = new Map();
  for (const w of watchPlayers) {
    bySteamId.set(String(w.steamId64), w);
    const nick = w.nicknameNormalized || normalizeNickname(w.nickname);
    if (nick) {
      if (!byNickname.has(nick)) byNickname.set(nick, []);
      byNickname.get(nick).push(w);
    }
  }

  const found = [];
  const seenSteamIds = new Set();
  for (const sp of serverPlayers) {
    let player = null;
    let matchedBy = null;

    if (sp.steamId64 && bySteamId.has(String(sp.steamId64))) {
      player = bySteamId.get(String(sp.steamId64));
      matchedBy = 'steamid';
    } else {
      const nick = normalizeNickname(sp.name);
      const candidates = nick && byNickname.get(nick);
      if (candidates && candidates.length > 0) {
        player = candidates[0];
        matchedBy = 'nickname';
      }
    }

    if (player) {
      found.push({ player, serverPlayer: sp, matchedBy });
      seenSteamIds.add(String(player.steamId64));
    }
  }
  return { found, seenSteamIds };
}
