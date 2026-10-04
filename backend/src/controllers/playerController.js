import Player, { normalizeNickname } from '../models/Player.js';
import User from '../models/User.js';
import WatchlistItem from '../models/WatchlistItem.js';
import TrackingSession from '../models/TrackingSession.js';
import env from '../config/env.js';
import {
  extractSteamIdFromInput,
  resolveVanityUrl,
  getPlayerSummaries,
} from '../services/steamApiService.js';

const DEFAULT_NOTIFY = { enter: true, exit: true, serverChange: true, sound: true };

/** Обновляет/создаёт карточку игрока по SteamID64 (без добавления в watchlist). */
async function ensurePlayerCard(steamId64) {
  let summary = null;
  if (env.steamApiKey) {
    try {
      [summary] = await getPlayerSummaries([steamId64]);
    } catch {
      /* добавим без анкеты — опрос подтянет данные позже */
    }
  }
  let player = await Player.findOne({ steamId64 });
  if (!player) {
    player = await Player.create({
      steamId64,
      nickname: summary?.nickname || '',
      nicknameNormalized: normalizeNickname(summary?.nickname || ''),
      avatar: summary?.avatar || '',
      profileUrl: summary?.profileUrl || '',
    });
  } else {
    let changed = false;
    if (!player.active) { player.active = true; changed = true; }
    if (summary?.nickname && summary.nickname !== player.nickname) {
      player.nickname = summary.nickname;
      player.nicknameNormalized = normalizeNickname(summary.nickname);
      changed = true;
    }
    if (summary?.avatar && summary.avatar !== player.avatar) { player.avatar = summary.avatar; changed = true; }
    if (summary?.profileUrl && summary.profileUrl !== player.profileUrl) { player.profileUrl = summary.profileUrl; changed = true; }
    if (changed) await player.save();
  }
  return player;
}

/** GET /api/players/search?q= — найти игрока БЕЗ добавления в watchlist. */
export async function searchPlayer(req, res, next) {
  try {
    const q = String(req.query?.q || '').trim();
    if (!q) return res.status(400).json({ success: false, error: 'Укажите ?q=SteamID64 или ссылку' });

    const parsed = extractSteamIdFromInput(q);
    if (!parsed) {
      return res.status(400).json({ success: false, error: 'Не удалось распознать SteamID64 или ссылку на профиль' });
    }

    let steamId64 = parsed.steamId64 || null;
    if (!steamId64) {
      if (!env.steamApiKey) {
        return res.status(400).json({
          success: false,
          error: '«' + parsed.vanity + '» — vanity-URL: для резолва нужен STEAM_API_KEY. Используйте чистый SteamID64.',
        });
      }
      steamId64 = await resolveVanityUrl(parsed.vanity);
      if (!steamId64) {
        return res.status(404).json({ success: false, error: `Профиль «${parsed.vanity}» не найден в Steam` });
      }
    }

    const player = await ensurePlayerCard(steamId64);
    let trackedByMe = false;
    if (req.user) {
      trackedByMe = Boolean(
        await WatchlistItem.findOne({ user: req.user._id, player: player._id })
      );
    }
    res.json({
      success: true,
      data: { ...player.toPublic(), trackedByMe, notify: DEFAULT_NOTIFY },
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/players/:steamId64/track — кнопка «Отслеживать» (нужен вход). */
export async function trackPlayer(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Войдите через Steam, чтобы отслеживать игроков' });
    }
    const { steamId64 } = req.params;
    if (!/^\d{17}$/.test(steamId64)) {
      return res.status(400).json({ success: false, error: 'steamId64 должен быть 17 цифр' });
    }
    const player = await ensurePlayerCard(steamId64);
    const item = await WatchlistItem.findOneAndUpdate(
      { user: req.user._id, player: player._id },
      { $setOnInsert: { user: req.user._id, player: player._id, notify: DEFAULT_NOTIFY } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // поддерживаем legacy-поле User.watchlist
    await User.updateOne({ _id: req.user._id }, { $addToSet: { watchlist: player._id } });

    res.status(201).json({
      success: true,
      data: { ...player.toPublic(), notify: item.notify },
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/players/:steamId64/notify — персональные настройки уведомлений. */
export async function updateNotify(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Нужен вход через Steam' });
    const { steamId64 } = req.params;
    const allowed = ['enter', 'exit', 'serverChange', 'sound'];
    const patch = {};
    for (const k of allowed) {
      if (typeof req.body?.[k] === 'boolean') patch[`notify.${k}`] = req.body[k];
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ success: false, error: 'Пустой patch (enter/exit/serverChange/sound)' });
    }
    const player = await Player.findOne({ steamId64 });
    if (!player) return res.status(404).json({ success: false, error: 'Игрок не найден' });
    const item = await WatchlistItem.findOneAndUpdate(
      { user: req.user._id, player: player._id },
      { $set: patch },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, error: 'Игрок не в вашем watchlist' });
    res.json({ success: true, data: { steamId64, notify: item.notify } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/players?history=1 — статус отслеживаемых.
 *  Для вошедшего — только его watchlist (с персональными настройками уведомлений);
 *  без входа — общий список (демо-режим). */
export async function listPlayers(req, res, next) {
  try {
    if (req.user) {
      const items = await WatchlistItem.find({ user: req.user._id }).populate('player');
      const players = items
        .filter((it) => it.player && it.player.active)
        .sort((a, b) => {
          const score = (p) => (p.isInRust ? 2 : 0) + (p.isOnline ? 1 : 0);
          return score(b.player) - score(a.player);
        })
        .map((it) => ({
          ...it.player.toPublic(),
          notify: { ...DEFAULT_NOTIFY, ...(it.notify?.toObject?.() || it.notify || {}) },
        }));
      return res.json({ success: true, data: players });
    }

    const find = Player.find({ active: true }).sort({
      isInRust: -1,
      isOnline: -1,
      updatedAt: -1,
    });
    if (req.query.history === '1') find.select('+onlineHistory');
    const players = await find.exec();
    res.json({
      success: true,
      data: players.map((p) => {
        const out = p.toPublic();
        if (p.onlineHistory) out.onlineHistory = p.onlineHistory;
        return out;
      }),
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/players — совместимый путь: добавить в watchlist сразу
 *  (для авторизованного — в личный, для гостя — глобально в демо-режиме). */
export async function addPlayer(req, res, next) {
  try {
    const { steamIdOrUrl } = req.body || {};
    if (!steamIdOrUrl) {
      return res
        .status(400)
        .json({ success: false, error: 'Укажите steamIdOrUrl (SteamID64 или ссылка на профиль)' });
    }

    const parsed = extractSteamIdFromInput(steamIdOrUrl);
    if (!parsed) {
      return res
        .status(400)
        .json({ success: false, error: 'Не удалось распознать SteamID64 или ссылку на профиль' });
    }

    let steamId64 = parsed.steamId64 || null;
    if (!steamId64) {
      if (!env.steamApiKey) {
        return res.status(400).json({
          success: false,
          error: `«${parsed.vanity}» — vanity-URL: для резолва нужен STEAM_API_KEY. Добавьте по чистому SteamID64.`,
        });
      }
      steamId64 = await resolveVanityUrl(parsed.vanity);
      if (!steamId64) {
        return res.status(404).json({ success: false, error: `Профиль «${parsed.vanity}» не найден в Steam` });
      }
    }

    const player = await ensurePlayerCard(steamId64);

    if (req.user) {
      await WatchlistItem.updateOne(
        { user: req.user._id, player: player._id },
        { $setOnInsert: { user: req.user._id, player: player._id, notify: DEFAULT_NOTIFY } },
        { upsert: true }
      );
      await User.updateOne({ _id: req.user._id }, { $addToSet: { watchlist: player._id } });
    }

    res.status(201).json({ success: true, data: { ...player.toPublic(), notify: DEFAULT_NOTIFY } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/players/:steamId64 — детальная карточка: история, сессии, статистика, настройки. */
export async function getPlayer(req, res, next) {
  try {
    const { steamId64 } = req.params;
    if (!/^\d{17}$/.test(steamId64)) {
      return res.status(400).json({ success: false, error: 'steamId64 должен быть 17 цифр' });
    }
    const player = await Player.findOne({ steamId64, active: true }).select('+onlineHistory');
    if (!player) return res.status(404).json({ success: false, error: 'Игрок не найден в watchlist' });

    const sessions = await TrackingSession.find({ steamId64 })
      .sort({ startedAt: -1 })
      .limit(50);

    const stats = await TrackingSession.aggregate([
      { $match: { steamId64, isActive: false } },
      {
        $group: {
          _id: '$source',
          sessions: { $sum: 1 },
          totalMinutes: { $sum: '$durationMinutes' },
        },
      },
    ]);

    let notify = null;
    let trackedByMe = false;
    if (req.user) {
      const item = await WatchlistItem.findOne({ user: req.user._id, player: player._id });
      if (item) {
        trackedByMe = true;
        notify = item.notify;
      }
    }

    res.json({
      success: true,
      data: {
        player: { ...player.toPublic(), onlineHistory: player.onlineHistory, trackedByMe, notify },
        sessions: sessions.map((s) => s.toPublic()),
        stats: Object.fromEntries(
          stats.map((r) => [r._id, { sessions: r.sessions, totalMinutes: r.totalMinutes }])
        ),
      },
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/players/:steamId64 — убрать из СВОЕГО watchlist.
 *  Если этого игрока больше никто не отслеживает — деактивируем трекинг и закрываем сессии. */
export async function removePlayer(req, res, next) {
  try {
    const { steamId64 } = req.params;
    const player = await Player.findOne({ steamId64, active: true });
    if (!player) return res.status(404).json({ success: false, error: 'Игрок не найден в watchlist' });

    if (req.user) {
      await WatchlistItem.deleteOne({ user: req.user._id, player: player._id });
      await User.updateOne({ _id: req.user._id }, { $pull: { watchlist: player._id } });
      const stillTracked = await WatchlistItem.countDocuments({ player: player._id });
      if (stillTracked > 0) {
        return res.json({ success: true, data: { steamId64, removed: true, stillTrackedByOthers: true } });
      }
    }

    player.active = false;
    await player.save();
    await TrackingSession.closeSessions({ steamId64, source: 'steam' });
    await TrackingSession.closeSessions({ steamId64, source: 'a2s' });
    await TrackingSession.closeSessions({ steamId64, source: 'gameserverip' });
    res.json({ success: true, data: { steamId64, removed: true } });
  } catch (err) {
    next(err);
  }
}
