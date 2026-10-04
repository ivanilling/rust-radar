// Тонкая обёртка над API бэкенда (в dev все запросы идут через прокси Vite)
async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* пустой ответ */
  }
  if (!res.ok || json?.success === false) {
    const message = json?.error || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  health: () => request('/api/health'),
  trackStatus: () => request('/api/track/status'),
  runTracker: () => request('/api/track/run', { method: 'POST' }),

  listPlayers: (withHistory = false) =>
    request(`/api/players${withHistory ? '?history=1' : ''}`),
  searchPlayer: (q) =>
    request(`/api/players/search?q=${encodeURIComponent(q)}`),
  trackPlayer: (steamId64) =>
    request(`/api/players/${steamId64}/track`, { method: 'POST' }),
  updateNotify: (steamId64, patch) =>
    request(`/api/players/${steamId64}/notify`, { method: 'PATCH', body: JSON.stringify(patch) }),
  getPlayer: (steamId64) => request(`/api/players/${steamId64}`),
  removePlayer: (steamId64) => request(`/api/players/${steamId64}`, { method: 'DELETE' }),

  listServers: () => request('/api/servers'),
  addServer: (host, port) =>
    request('/api/servers', { method: 'POST', body: JSON.stringify({ host, port }) }),
  scanServer: (id) => request(`/api/servers/${id}/scan`, { method: 'POST' }),
  deleteServer: (id) => request(`/api/servers/${id}`, { method: 'DELETE' }),

  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  devLogin: () => request('/api/auth/_dev-login'),

  telegramStatus: () => request('/api/telegram/status'),
  telegramLink: () => request('/api/telegram/link', { method: 'POST' }),
};

/** Короткий сигнал уведомления (Web Audio, без файлов). */
let audioCtx = null;
export function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const t = audioCtx.currentTime;
    [0, 0.18].forEach((delay, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 880 : 1175, t + delay);
      gain.gain.setValueAtTime(0.08, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.18);
    });
  } catch {
    /* звук не критичен */
  }
}

/** Статус игрока для радара: ingame | onserver | rust | online | offline */
export function playerStatus(p) {
  if (p.isInRust) return 'ingame';
  if (p.currentServer) return 'onserver';
  if (p.isOnline) return 'online';
  return 'offline';
}

export const isInGameNow = (p) => ['ingame', 'onserver', 'rust'].includes(playerStatus(p));

export function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} дн назад`;
}

export function fmtDuration(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}
