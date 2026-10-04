import WatchlistItem from '../models/WatchlistItem.js';
import { send } from './telegramService.js';
import logger from '../utils/logger.js';

const TEXT = {
  enter: (p, extra) =>
    `🟢 <b>ВРАГ В СЕТИ</b>\n<b>${p.nickname || p.steamId64}</b> зашёл в Rust` +
    (p.currentServer?.name ? `\nсервер: ${p.currentServer.name}` : extra?.serverName ? `\nсервер: ${extra.serverName}` : ''),
  exit: (p) =>
    `🔴 <b>Враг вышел</b>\n<b>${p.nickname || p.steamId64}</b> покинул Rust`,
  serverChange: (p, extra) =>
    `🔀 <b>Смена сервера</b>\n<b>${p.nickname || p.steamId64}</b>\nтеперь: ${extra?.serverName || p.currentServer?.name || 'неизвестно'}`,
};

/**
 * Разослать события по всем отслеживающим этого игрока.
 * Событие уходит только если оно включено в ПЕРСОНАЛЬНЫХ настройках
 * (WatchlistItem.notify) — те же настройки, что и на сайте.
 */
export async function dispatch(player, events, extra = {}) {
  if (!events.length) return;
  const items = await WatchlistItem.find({ player: player._id }).populate('user');
  for (const item of items) {
    const user = item.user;
    if (!user?.telegramChatId) continue;
    for (const ev of events) {
      if (item.notify?.[ev] === false) continue; // событие выключено пользователем
      const text = TEXT[ev]?.(player, extra);
      if (text) await send(user.telegramChatId, text);
    }
  }
  logger.debug('notify dispatch', player.steamId64, events.join(','), `watchers=${items.length}`);
}
