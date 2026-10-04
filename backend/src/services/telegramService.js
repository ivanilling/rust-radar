import env from '../config/env.js';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import WatchlistItem from '../models/WatchlistItem.js';
import Player from '../models/Player.js';

/**
 * Telegram-бот: long-polling getUpdates (работает без публичного URL и webhook'а).
 * Команды: /start, /link КОД (привязка аккаунта), /list (статус врагов),
 * /settings (показать настройки), /unwatch <steamId64>, /help.
 * Уведомления шлёт с учётом ПЕРСОНАЛЬНЫХ настроек каждого отслеживания
 * (WatchlistItem.notify) — те же, что настроены на сайте.
 */

const API = () => `https://api.telegram.org/bot${env.telegramBotToken}`;
let polling = false;
let botUsername = null;
let offset = 0;

async function tg(method, body = {}) {
  const res = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok) {
    throw new Error(`Telegram ${method}: ${data?.description || res.status}`);
  }
  return data.result;
}

export async function send(chatId, text) {
  if (!env.telegramBotToken) return;
  try {
    await tg('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (err) {
    logger.warn(`TG send к ${chatId} не удался: ${err.message}`);
  }
}

export async function sendWithKeyboard(chatId, text, keyboard) {
  if (!env.telegramBotToken) return;
  try {
    await tg('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    logger.warn(`TG send к ${chatId} не удался: ${err.message}`);
  }
}

export function isEnabled() {
  return Boolean(env.telegramBotToken);
}

export function getBotUsername() {
  return botUsername;
}

/** Статус привязки по chat_id. */
async function findUserByChat(chatId) {
  return User.findOne({ telegramChatId: String(chatId) });
}

const fmtPlayer = (p) =>
  `${p.isInRust ? '🟢' : p.currentServer ? '📍' : p.isOnline ? '🟡' : '🔴'} <b>${p.nickname || p.steamId64}</b>` +
  (p.currentServer ? `\n   сервер: ${p.currentServer.name || p.currentServer.host}` : '') +
  `\n   <code>${p.steamId64}</code>`;

async function handleCommand(msg) {
  const chatId = String(msg.chat?.id || '');
  const text = String(msg.text || '').trim();
  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = rawCmd.toLowerCase().split('@')[0];
  logger.debug('TG command', cmd, args.join(' '));

  if (cmd === '/start') {
    const linked = await findUserByChat(chatId);
    if (linked) {
      return send(chatId, `Привет, ${linked.username || 'оперативник'}! Аккаунт уже привязан.\n/list — статус врагов\n/settings — настройки уведомлений`);
    }
    return send(
      chatId,
      'Привет! Я радар твоих врагов в Rust. 🔥\n\n' +
        'Чтобы привязать аккаунт:\n1. Открой сайт → карточка «TELEGRAM» → «Получить код»\n' +
        '2. Пришли сюда: /link КОД\n\n' +
        'Дальше я сам буду писать, когда враг зайдёт в Rust, выйдет или сменит сервер — по тем настройкам, что включены на сайте.'
    );
  }

  if (cmd === '/link') {
    const code = (args[0] || '').trim().toUpperCase();
    if (!code) return send(chatId, 'Пришли код с сайта: /link КОД');
    const user = await User.findOne({
      tgLinkCode: code,
      tgLinkCodeExpires: { $gt: new Date() },
    });
    if (!user) {
      return send(chatId, '❌ Код не найден или истёк. Получи новый на сайте.');
    }
    user.telegramChatId = chatId;
    user.telegramUsername = msg.from?.username || null;
    user.tgLinkCode = null;
    user.tgLinkCodeExpires = null;
    await user.save();
    return send(chatId, `✅ Привязано к аккаунту ${user.username || user.steamId64}!\nТеперь по настройкам с сайта буду присылать события врагов. /list — проверить.`);
  }

  const user = await findUserByChat(chatId);
  if (!user) {
    return send(chatId, 'Сначала привяжи аккаунт: /link КОД (код на сайте в карточке TELEGRAM)');
  }

  if (cmd === '/list') {
    const items = await WatchlistItem.find({ user: user._id }).populate('player');
    if (!items.length) return send(chatId, 'Watchlist пуст. Добавь врага на сайте или командой: /watch <SteamID64>');
    const lines = items.map((it) => fmtPlayer(it.player));
    return send(chatId, `Твои враги (${items.length}):\n\n${lines.join('\n\n')}`);
  }

  if (cmd === '/watch') {
    const steamId64 = (args[0] || '').trim();
    if (!/^\d{17}$/.test(steamId64)) {
      return send(chatId, 'Пришли SteamID64 (17 цифр): /watch 76561198012345678');
    }
    let player = await Player.findOne({ steamId64 });
    if (!player) {
      player = await Player.create({ steamId64, nickname: '', nicknameNormalized: '' });
    } else if (!player.active) {
      player.active = true;
      await player.save();
    }
    await WatchlistItem.updateOne(
      { user: user._id, player: player._id },
      { $setOnInsert: { user: user._id, player: player._id } },
      { upsert: true }
    );
    return send(chatId, `✅ ${player.nickname || steamId64} — отслеживаю. Настройки уведомлений: /settings или на сайте.`);
  }

  if (cmd === '/unwatch') {
    const steamId64 = (args[0] || '').trim();
    const player = await Player.findOne({ steamId64 });
    if (!player) return send(chatId, 'Такого игрока нет.');
    const r = await WatchlistItem.deleteOne({ user: user._id, player: player._id });
    return send(chatId, r.deletedCount ? `🗑 ${player.nickname || steamId64} убран из отслеживания.` : 'Он и не отслеживался.');
  }

  if (cmd === '/settings') {
    const items = await WatchlistItem.find({ user: user._id }).populate('player');
    if (!items.length) return send(chatId, 'Пока некого настраивать — watchlist пуст.');
    const on = (b) => (b ? '✅' : '❌');
    const lines = items.map(
      (it) =>
        `<b>${it.player.nickname || it.player.steamId64}</b>\n` +
        `  зашёл в Rust: ${on(it.notify?.enter)} | вышел: ${on(it.notify?.exit)} | смена сервера: ${on(it.notify?.serverChange)}`
    );
    return send(
      chatId,
      'Настройки уведомлений (общие с сайтом):\n\n' +
        lines.join('\n\n') +
        '\n\n⚠️ Меняются на сайте — в профиле каждого врага.'
    );
  }

  if (cmd === '/help') {
    return send(chatId, '/list — враги и где они\n/watch SteamID64 — добавить\n/unwatch SteamID64 — убрать\n/settings — уведомления');
  }

  return send(chatId, 'Не понял команду. /help — список команд.');
}

async function pollLoop() {
  while (polling) {
    try {
      const me = await tg('getMe');
      botUsername = me.username;
      logger.info(`TG бот @${botUsername} на связи`);
      break;
    } catch (err) {
      logger.warn('TG getMe не удался, повтор через 15с:', err.message);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  if (!polling) return;

  while (polling) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 25 });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message?.text) {
          await handleCommand(u.message).catch((e) =>
            logger.error('TG command error:', e.message)
          );
        }
      }
    } catch (err) {
      if (polling) {
        logger.warn('TG polling error, повтор через 10с:', err.message);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  }
}

export function startTelegramPolling() {
  if (!env.telegramBotToken) {
    logger.info('TELEGRAM_BOT_TOKEN не задан — бот отключён');
    return;
  }
  if (polling) return;
  polling = true;
  pollLoop().catch((e) => logger.error('TG polling упал:', e.message));
}

export function stopTelegramPolling() {
  polling = false;
}
