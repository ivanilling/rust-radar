import env from '../config/env.js';
import logger from '../utils/logger.js';

const CHUNK_SIZE = 100; // Steam API принимает максимум 100 steamid за запрос

function parseProfile(profile) {
  const inRust =
    profile.gameid === env.rustAppId || profile.gameextrainfo === 'Rust';
  // IP:порт сервера, на котором игрок сидит прямо сейчас (для игр с сервер-браузером Steam, Rust — да)
  const gameserverip =
    typeof profile.gameserverip === 'string' && /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(profile.gameserverip)
      ? profile.gameserverip
      : null;
  return {
    steamId64: profile.steamid,
    nickname: profile.personaname || '',
    avatar: profile.avatarfull || '',
    profileUrl: profile.profileurl || '',
    // personastate 0 = offline/invisible
    isOnline: Number(profile.personastate) !== 0,
    isInRust: inRust,
    gameserverip,
    personaState: Number(profile.personastate || 0),
    lastLogoff: profile.lastlogoff ? new Date(profile.lastlogoff * 1000) : null,
    gameExtraInfo: profile.gameextrainfo || null,
  };
}

async function steamFetch(path, params) {
  const url = new URL(path, env.steamApiBase);
  url.searchParams.set('key', env.steamApiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Steam API HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * GetPlayerSummaries по списку SteamID64.
 * Возвращает массив { steamId64, nickname, avatar, profileUrl, isOnline, isInRust, ... }.
 */
export async function getPlayerSummaries(steamIds) {
  if (!env.steamApiKey) throw new Error('STEAM_API_KEY не настроен');
  const ids = [...new Set(steamIds.map(String))];
  const results = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const data = await steamFetch('/ISteamUser/GetPlayerSummaries/v2/', {
      steamids: chunk.join(','),
    });
    const players = data?.response?.players || [];
    for (const p of players) results.push(parseProfile(p));
  }
  return results;
}

/** Резолв кастомного URL (steamcommunity.com/id/<vanity>) в SteamID64. */
export async function resolveVanityUrl(vanity) {
  const data = await steamFetch('/ISteamUser/ResolveVanityURL/v1/', {
    vanityurl: vanity,
  });
  if (data?.response?.success === 1 && data.response.steamid) {
    return data.response.steamid;
  }
  return null;
}

/**
 * Распознаёт SteamID64 в произвольном вводе: чистый ID или ссылка на профиль.
 * Возвращает { steamId64 } | { vanity } | null.
 */
export function extractSteamIdFromInput(input) {
  const s = String(input || '').trim();
  if (!s) return null;

  let m = s.match(/^(7656\d{13})$/); // чистый SteamID64
  if (m) return { steamId64: m[1] };

  m = s.match(/steamcommunity\.com\/profiles\/(7656\d{13})/i);
  if (m) return { steamId64: m[1] };

  m = s.match(/steamcommunity\.com\/(?:id|profiles)\/([^/?#\s]+)/i);
  if (m && !/^(7656\d{13})$/i.test(m[1])) return { vanity: m[1] };

  // «голый» кастомный URL без домена (например 'gaben')
  if (/^[a-z0-9_-]{2,64}$/i.test(s)) return { vanity: s };

  return null;
}

/** Резолв произвольного ввода (ID/ссылка/вanity) в SteamID64. */
export async function resolveSteamId(input) {
  const parsed = extractSteamIdFromInput(input);
  if (!parsed) return null;
  if (parsed.steamId64) return parsed.steamId64;
  return resolveVanityUrl(parsed.vanity);
}
