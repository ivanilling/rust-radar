import GameServer from '../models/GameServer.js';
import Player from '../models/Player.js';
import { queryServer, matchPlayers } from '../services/a2sScanner.js';

/** POST /api/servers — добавить Rust-сервер (host + порт, по умолчанию 28015). */
export async function addServer(req, res, next) {
  try {
    const host = String(req.body?.host || '').trim();
    const port = Number(req.body?.port || 28015);
    if (!host) return res.status(400).json({ success: false, error: 'Укажите host (IP или домен)' });
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return res.status(400).json({ success: false, error: 'Некорректный порт' });
    }

    // живая проверка A2S сразу при добавлении (не блокирует сохранение при недоступности)
    let probed = null;
    let probeError = null;
    try {
      probed = await queryServer({ host, port });
    } catch (err) {
      probeError = err.message;
    }

    const server = await GameServer.findOneAndUpdate(
      { host, port },
      {
        $set: {
          host,
          port,
          ...(probed
            ? {
                name: probed.name,
                map: probed.map,
                isOnline: true,
                playersCount: probed.playersCount,
                maxPlayers: probed.maxPlayers,
                lastPolledAt: new Date(),
                lastError: null,
              }
            : {}),
        },
        $setOnInsert: { active: true },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      success: true,
      data: {
        ...server.toPublic(),
        probed: Boolean(probed),
        probeError: probeError || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/servers — список серверов со статусом последнего скана. */
export async function listServers(req, res, next) {
  try {
    const servers = await GameServer.find({ active: true }).sort({ isOnline: -1, name: 1 });
    res.json({ success: true, data: servers.map((s) => s.toPublic()) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/servers/:id — убрать сервер из скана. */
export async function deleteServer(req, res, next) {
  try {
    const server = await GameServer.findOneAndUpdate(
      { _id: req.params.id, active: true },
      { active: false },
      { new: true }
    );
    if (!server) return res.status(404).json({ success: false, error: 'Сервер не найден' });
    res.json({ success: true, data: { id: server.id, removed: true } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/servers/:id/scan — разовый A2S-скан одного сервера + матчинг watchlist. */
export async function rescanServer(req, res, next) {
  try {
    const server = await GameServer.findOne({ _id: req.params.id, active: true });
    if (!server) return res.status(404).json({ success: false, error: 'Сервер не найден' });

    try {
      const query = await queryServer({ host: server.host, port: server.port });
      server.isOnline = true;
      server.name = query.name || server.name;
      server.map = query.map;
      server.playersCount = query.playersCount;
      server.maxPlayers = query.maxPlayers;
      server.lastPolledAt = new Date();
      server.lastError = null;
      await server.save();

      const players = await Player.find({ active: true });
      const { found } = matchPlayers(query.players, players);

      res.json({
        success: true,
        data: {
          server: server.toPublic(),
          matched: found.map(({ player, serverPlayer, matchedBy }) => ({
            steamId64: player.steamId64,
            nickname: player.nickname || serverPlayer.name,
            matchedBy,
            serverPlayerName: serverPlayer.name,
          })),
        },
      });
    } catch (err) {
      server.isOnline = false;
      server.lastError = err.message.slice(0, 300);
      server.lastPolledAt = new Date();
      await server.save();
      res.json({
        success: true,
        data: { server: server.toPublic(), matched: [], error: err.message },
      });
    }
  } catch (err) {
    next(err);
  }
}
