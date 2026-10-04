import Player, { ONLINE_HISTORY_LIMIT, normalizeNickname } from '../models/Player.js';
import GameServer from '../models/GameServer.js';
import TrackingSession from '../models/TrackingSession.js';
import { getPlayerSummaries } from './steamApiService.js';
import { queryServer, matchPlayers } from './a2sScanner.js';
import { resolveServerName } from './serverNameService.js';
import { dispatch } from './notifyService.js';
import { emitPlayerEvent } from './eventBus.js';

const inGameNow = (p) => Boolean(p.isInRust || p.currentServer);
const serverKeyOf = (p) => (p.currentServer ? `${p.currentServer.host}:${p.currentServer.port}` : null);

/** Пуш события в SSE-шину (сайт получает его мгновенно). */
function pushEvent(player, event, extra = {}) {
  emitPlayerEvent({
    event,
    player: player.toPublic(),
    serverName: extra.serverName || player.currentServer?.name || null,
    at: new Date().toISOString(),
  });
}
import env from '../config/env.js';
import logger from '../utils/logger.js';

let cycleTimer = null;
let running = false;
let steamWarned = false;
let stopped = true;

let nextDelay = null; // адаптивный интервал: быстрый, пока кто-то в игре

const tick = () =>
  runOnce()
    .then((stats) => {
      scheduleNext(stats?.anyInRust === true);
    })
    .catch((err) => {
      logger.error('Цикл трекера упал:', err.message);
      scheduleNext(false);
    });

/** Запуск периодического цикла (Steam-опрос + A2S-скан). */
export function startTracker() {
  if (cycleTimer) return;
  stopped = false;
  cycleTimer = setTimeout(tick, 1200);
  cycleTimer.unref?.();
  logger.info(
    `Трекер запущен: цикл каждые ${Math.round(env.trackIntervalMs / 1000)}с` +
      (env.trackFastIntervalMs < env.trackIntervalMs
        ? ` (пока кто-то в игре — каждые ${Math.round(env.trackFastIntervalMs / 1000)}с)`
        : '')
  );
}

/** Ставит следующий цикл: быстрый интервал, если кто-то в игре. */
function scheduleNext(anyInRust) {
  if (stopped) return;
  const delay = anyInRust ? Math.min(env.trackFastIntervalMs, env.trackIntervalMs) : env.trackIntervalMs;
  nextDelay = delay;
  cycleTimer = setTimeout(tick, delay);
  cycleTimer.unref?.();
}

export function stopTracker() {
  stopped = true;
  if (cycleTimer) {
    clearTimeout(cycleTimer);
    cycleTimer = null;
  }
}

/**
 * Один полный цикл слежки: A2S-скан всех серверов → Steam-опрос всех врагов.
 * Возвращает статистику цикла (используется и для POST /api/track/run).
 */
export async function runOnce() {
  if (running) return { skipped: true, reason: 'previous cycle still running' };
  running = true;
  const startedAt = Date.now();
  try {
    const players = await Player.find({ active: true });
    if (players.length === 0) {
      return { ok: true, tookMs: Date.now() - startedAt, note: 'watchlist пуст' };
    }
    const servers = await GameServer.find({ active: true });

    const a2s = await scanAllServers(servers, players);
    const steam = await pollSteam(players);

    return {
      ok: true,
      tookMs: Date.now() - startedAt,
      anyInRust: players.some((p) => p.isInRust || p.currentServer),
      nextDelayMs: nextDelay,
      ...a2s,
      ...steam,
    };
  } finally {
    running = false;
  }
}

/** Метод 2: скан Rust-серверов по A2S, поиск врагов среди игроков. */
async function scanAllServers(servers, players) {
  const stats = {
    serversScanned: 0,
    serversOnline: 0,
    foundOnServers: 0,
  };
  const now = new Date();

  for (const server of servers) {
    stats.serversScanned++;
    let query;
    try {
      query = await queryServer({ host: server.host, port: server.port });
      stats.serversOnline++;
    } catch (err) {
      server.isOnline = false;
      server.lastError = err.message.slice(0, 300);
      server.lastPolledAt = now;
      await server.save();
      logger.warn(`A2S ${server.host}:${server.port} недоступен: ${err.message}`);
      continue;
    }

    server.isOnline = true;
    server.name = query.name || server.name;
    server.map = query.map || '';
    server.playersCount = query.playersCount;
    server.maxPlayers = query.maxPlayers;
    server.lastPolledAt = now;
    server.lastError = null;
    await server.save();

    const { found, seenSteamIds } = matchPlayers(query.players, players);
    for (const { player, matchedBy } of found) {
      const wasInGame = inGameNow(player);
      const prevKey = serverKeyOf(player);
      const newKey = `${server.host}:${server.port}`;

      player.currentServer = {
        host: server.host,
        port: server.port,
        name: server.name,
        matchedBy,
        updatedAt: now,
      };
      player.lastSeenOnServerAt = now;
      player.lastSeenInRustAt = now;
      await player.save();
      await TrackingSession.openIfAbsent({
        player,
        source: 'a2s',
        server: { host: server.host, port: server.port, name: server.name },
        matchedBy,
        now,
      });
      stats.foundOnServers++;

      // события из A2S-скана (важно, когда Steam не подтверждает игру)
      const a2sEvents = [];
      if (!wasInGame) a2sEvents.push('enter');
      else if (prevKey && prevKey !== newKey) a2sEvents.push('serverChange');
      if (a2sEvents.length) {
        await dispatch(player, a2sEvents, { serverName: server.name });
        for (const ev of a2sEvents) pushEvent(player, ev, { serverName: server.name });
      }
    }

    // Игроки, числившиеся именно на этом сервере, но не найденные в текущем скане:
    // закрываем их a2s-сессии и сбрасываем currentServer.
    const openHere = await TrackingSession.find({
      'server.host': server.host,
      'server.port': server.port,
      source: 'a2s',
      isActive: true,
    });
    for (const s of openHere) {
      if (seenSteamIds.has(String(s.steamId64))) continue;
      await TrackingSession.closeSessions({
        steamId64: s.steamId64,
        source: 'a2s',
        server: { host: server.host, port: server.port },
        now,
      });
      // сбрасываем currentServer и в БД, и на in-memory документе (им ещё пользуется pollSteam)
      await Player.updateOne(
        {
          steamId64: s.steamId64,
          'currentServer.host': server.host,
          'currentServer.port': server.port,
        },
        { $set: { currentServer: null } }
      );
      const doc = players.find((pl) => String(pl.steamId64) === String(s.steamId64));
      if (
        doc?.currentServer &&
        doc.currentServer.host === server.host &&
        doc.currentServer.port === server.port
      ) {
        doc.currentServer = null;
      }
    }
  }
  return stats;
}

/** Метод 1: Steam Web API GetPlayerSummaries — онлайн в Steam + запущена ли Rust. */
async function pollSteam(players) {
  const stats = { steamChecked: 0, steamError: null };
  if (!env.steamApiKey) {
    if (!steamWarned) {
      logger.warn('STEAM_API_KEY не задан — Steam-опрос отключён, работает только A2S-скан');
      steamWarned = true;
    }
    return stats;
  }

  try {
    const summaries = await getPlayerSummaries(players.map((p) => p.steamId64));
    const byId = new Map(summaries.map((s) => [String(s.steamId64), s]));
    const now = new Date();

    for (const p of players) {
      const s = byId.get(String(p.steamId64));
      if (!s) continue;
      stats.steamChecked++;

      // фиксируем прошлое состояние для детекта событий
      const prevInRust = p.isInRust;
      const prevServerKey = p.currentServer
        ? `${p.currentServer.host}:${p.currentServer.port}`
        : null;

      p.isOnline = s.isOnline;
      p.isInRust = s.isInRust;
      p.steamStatus = {
        personaState: s.personaState,
        lastLogoff: s.lastLogoff,
        gameExtraInfo: s.gameExtraInfo,
        updatedAt: now,
      };
      if (s.nickname) {
        p.nickname = s.nickname;
        p.nicknameNormalized = normalizeNickname(s.nickname);
      }
      if (s.avatar) p.avatar = s.avatar;
      if (s.profileUrl) p.profileUrl = s.profileUrl;
      if (s.isOnline) p.lastSeenOnlineAt = now;
      if (s.isInRust) p.lastSeenInRustAt = now;

      // метод 3: Steam сам сообщает IP:порт сервера (gameserverip) — работает без UDP.
      // Не перетираем результат живого A2S-скана (у того приоритет: он точнее по времени).
      const canUseSteamIp =
        !p.currentServer || p.currentServer.matchedBy === 'gameserverip';
      if (s.isInRust && s.gameserverip && canUseSteamIp) {
        const [gHost, gPortStr] = s.gameserverip.split(':');
        const gPort = Number(gPortStr);
        const gName = (await resolveServerName(gHost, gPort)) || s.gameserverip;
        p.currentServer = {
          host: gHost,
          port: gPort,
          name: gName,
          matchedBy: 'gameserverip',
          updatedAt: now,
        };
        p.lastSeenOnServerAt = now;
      } else if (p.currentServer?.matchedBy === 'gameserverip' && !s.gameserverip) {
        // Steam больше не сообщает сервер — снимаем отметку и закрываем сессию
        await TrackingSession.closeSessions({
          steamId64: p.steamId64,
          source: 'gameserverip',
          now,
        });
        p.currentServer = null;
      }

      await p.save();

      // steam-сессия «запущена Rust» (без привязки к серверу)
      if (s.isInRust) {
        await TrackingSession.openIfAbsent({ player: p, source: 'steam', now });
      } else {
        await TrackingSession.closeSessions({
          steamId64: p.steamId64,
          source: 'steam',
          now,
        });
      }

      // сессия «на конкретном сервере» по данным Steam
      if (s.isInRust && s.gameserverip && p.currentServer?.matchedBy === 'gameserverip') {
        await TrackingSession.openIfAbsent({
          player: p,
          source: 'gameserverip',
          server: {
            host: p.currentServer.host,
            port: p.currentServer.port,
            name: p.currentServer.name,
          },
          matchedBy: 'gameserverip',
          now,
        });
      }

      // события для уведомлений (сайт-тосты/SSE и Telegram с учётом персональных настроек)
      const newServerKey = serverKeyOf(p);
      const wasInGame = prevInRust || Boolean(prevServerKey);
      const nowInGame = inGameNow(p);
      const events = [];
      if (!wasInGame && nowInGame) events.push('enter');
      if (wasInGame && !nowInGame) events.push('exit');
      if (prevServerKey && newServerKey && prevServerKey !== newServerKey) events.push('serverChange');
      if (events.length) {
        await dispatch(p, events, { serverName: p.currentServer?.name });
        for (const ev of events) pushEvent(p, ev);
      }

      // комбинированный снапшот истории онлайна (кольцевой буфер)
      const serverFresh =
        p.currentServer?.updatedAt &&
        now - new Date(p.currentServer.updatedAt) < 2 * env.trackIntervalMs;
      await Player.updateOne(
        { _id: p._id },
        {
          $push: {
            onlineHistory: {
              $each: [
                {
                  at: now,
                  online: s.isOnline,
                  inRust: s.isInRust,
                  onServer: Boolean(serverFresh),
                },
              ],
              $slice: -ONLINE_HISTORY_LIMIT,
            },
          },
        }
      );
    }
  } catch (err) {
    stats.steamError = err.message;
    logger.error('Steam-опрос не удался:', err.message);
  }
  return stats;
}
