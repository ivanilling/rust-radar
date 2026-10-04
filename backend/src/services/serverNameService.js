import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Резолв названия Rust-сервера по IP:port БЕЗ UDP (сеть пользователя может резать A2S).
 * Источник: IGameServersService/GetServerList с фильтром \appid\252490\empty\1
 * — весь список живых Rust-серверов с именами (~5 тыс., ~2 МБ) одним HTTP-запросом.
 * Кэш обновляется раз в SERVER_LIST_REFRESH_MS; точное совпадение ip:port,
 * фоллбэк — единственный сервер на этом IP.
 */
const REFRESH_MS = Number(process.env.SERVER_LIST_REFRESH_MS) || 30 * 60 * 1000;

let cache = new Map(); // 'ip:port' -> name
let byIp = new Map(); // 'ip' -> [{ port, name }]
let inFlight = null;
let lastFetchedAt = 0;

async function fetchNameCache() {
  if (!env.steamApiKey) return;
  const url = new URL('/IGameServersService/GetServerList/v1/', env.steamApiBase);
  url.searchParams.set('key', env.steamApiKey);
  // ВСЕ серверы Rust (включая пустые — враг может сидеть на только что вайпнутом)
  url.searchParams.set('filter', '\\appid\\252490\\');
  url.searchParams.set('limit', '10000');
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`GetServerList HTTP ${res.status}`);
  const data = await res.json();
  const servers = data?.response?.servers || [];
  const newCache = new Map();
  const newByIp = new Map();
  for (const s of servers) {
    if (!s.addr || !s.name) continue;
    const [host, portStr] = String(s.addr).split(':');
    const port = Number(portStr);
    if (!host || !Number.isFinite(port)) continue;
    newCache.set(s.addr, s.name);
    if (!newByIp.has(host)) newByIp.set(host, []);
    newByIp.get(host).push({ port, name: s.name });
  }
  cache = newCache;
  byIp = newByIp;
  lastFetchedAt = Date.now();
  logger.info(`Кэш имён Rust-серверов обновлён: ${newCache.size} серверов`);
}

function ensureFresh(force = false) {
  if (inFlight) return inFlight;
  const fresh = cache.size > 0 && Date.now() - lastFetchedAt < REFRESH_MS;
  if (!force && fresh) return Promise.resolve();
  inFlight = fetchNameCache()
    .catch((err) => logger.warn('Кэш имён серверов не обновился:', err.message))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Название сервера по ip:port или null (если не нашли — вызывающий покажет ip:port). */
const addrApiCache = new Map(); // ip -> { expires, entries }

/** GetServersAtAddress: сопоставляет game-порт игрока с адресом сервера в мастере. */
async function resolveViaAddressApi(host, port) {
  const cached = addrApiCache.get(host);
  let entries;
  if (cached && cached.expires > Date.now()) {
    entries = cached.entries;
  } else {
    const res = await fetch(
      `https://api.steampowered.com/ISteamApps/GetServersAtAddress/v1/?addr=${host}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`GetServersAtAddress HTTP ${res.status}`);
    const json = await res.json();
    entries = (json?.response?.servers || []).filter((s) => s.gamedir === 'rust');
    addrApiCache.set(host, { expires: Date.now() + 10 * 60 * 1000, entries });
  }
  // у хостеров addr (query-порт) отличается от game-порта — сопоставляем именно gameport
  const exact = entries.find((s) => s.gameport === port);
  if (exact && cache.has(exact.addr)) return cache.get(exact.addr);
  if (entries.length === 1 && cache.has(entries[0].addr)) return cache.get(entries[0].addr);
  return null;
}

export async function resolveServerName(host, port) {
  await ensureFresh();
  const key = `${host}:${port}`;
  if (cache.has(key)) return cache.get(key);
  const atIp = byIp.get(String(host)) || [];
  if (atIp.length === 1) return atIp[0].name; // на IP только один Rust-сервер
  const samePort = atIp.find((s) => s.port === port);
  if (samePort) return samePort.name;
  // последний шанс: сопоставить game-порт игрока с адресом сервера через Steam
  try {
    return await resolveViaAddressApi(host, port);
  } catch {
    return null;
  }
}

/** Прогрев + периодическое обновление (вызывается при старте server.js). */
export function startNameCacheRefresher() {
  if (!env.steamApiKey) return;
  ensureFresh(true);
  setInterval(() => ensureFresh(true), REFRESH_MS).unref?.();
}
