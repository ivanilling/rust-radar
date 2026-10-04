import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, UserPlus, RefreshCw, Eye, BellRing, MapPin } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { api, playerStatus } from '../api.js';

const STATUS_LABEL = {
  ingame: ['В ИГРЕ', 'text-neon'],
  rust: ['В ИГРЕ · RUST', 'text-neon'],
  onserver: ['НА СЕРВЕРЕ', 'text-neon'],
  online: ['В СЕТИ · STEAM', 'text-amber-neon'],
  offline: ['ОФФЛАЙН', 'text-alert'],
};

/** Быстрые тумблеры уведомлений (появляются сразу после «Отслеживать»). */
function QuickNotify({ steamId64, notify, onSaved }) {
  const items = [
    { key: 'enter', label: 'вход в игру' },
    { key: 'exit', label: 'выход из игры' },
    { key: 'serverChange', label: 'смена сервера' },
    { key: 'sound', label: 'звук на сайте' },
  ];
  const set = async (key) => {
    try {
      await api.updateNotify(steamId64, { [key]: !notify[key] });
      onSaved({ ...notify, [key]: !notify[key] });
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="mt-3 rounded-md border border-neon/30 bg-neon/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 font-code text-[10px] tracking-widest text-neon">
        <BellRing size={11} /> УВЕДОМЛЕНИЯ (сайт + telegram)
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => set(key)}
            className={`rounded border px-2 py-1 font-code text-[10px] transition ${
              notify[key]
                ? 'border-neon/50 bg-neon/10 text-neon'
                : 'border-edge bg-panel2 text-ghost'
            }`}
          >
            {notify[key] ? '✅' : '⬜'} {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Поиск игрока: находит анкету БЕЗ отслеживания, трекинг — по кнопке. */
export default function PlayerSearch({ authed, onAdded, onError }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [notify, setNotify] = useState(null);
  const [tracked, setTracked] = useState(false);

  const search = async (e) => {
    e?.preventDefault?.();
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setTracked(false);
    setNotify(null);
    try {
      const { data } = await api.searchPlayer(q.trim());
      setResult(data);
      setTracked(Boolean(data.trackedByMe));
      if (data.trackedByMe) setNotify(data.notify);
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
    setBusy(false);
  };

  const track = async () => {
    setBusy(true);
    try {
      const { data } = await api.trackPlayer(result.steamId64);
      setNotify(data.notify);
      setTracked(true);
      onAdded?.();
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    }
    setBusy(false);
  };

  const st = result ? STATUS_LABEL[playerStatus(result)] : null;

  return (
    <div className="glass sheen rounded-2xl p-5">
      <h3 className="mb-1 font-display text-sm font-semibold tracking-widest text-white">
        НАЙТИ ВРАГА
      </h3>
      <p className="mb-4 font-code text-[10px] text-ghost">
        поиск не включает слежку — после нахождения жми «отслеживать»
      </p>
      <form onSubmit={search} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="76561198… или steamcommunity.com/id/…"
          className="min-w-0 flex-1 rounded-md border border-edge bg-panel2 px-3 py-2 font-code text-xs text-white placeholder:text-ghost/50 focus:border-neon/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="flex items-center gap-1.5 rounded-md border border-neon/40 bg-neon/10 px-3 py-2 font-display text-sm font-semibold text-neon transition hover:bg-neon/20 disabled:opacity-40"
        >
          {busy ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
          ОК
        </button>
      </form>

      {error && <p className="mt-2 font-code text-[11px] text-alert">{error}</p>}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5"
          >
            <div className="flex items-start gap-3">
              <Avatar
                src={result.avatar}
                className="h-11 w-11 shrink-0 rounded border border-edge object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-base font-bold text-white">
                  {result.nickname || 'НЕИЗВЕСТЕН'}
                </div>
                <div className="font-code text-[10px] text-ghost">{result.steamId64}</div>
                <div className={`mt-1 flex items-center gap-1 font-code text-[10px] ${st?.[1] || 'text-ghost'}`}>
                  <MapPin size={10} /> {st?.[0]}
                  {result.currentServer?.name ? ` · ${result.currentServer.name}` : ''}
                </div>
              </div>
            </div>

            {!tracked ? (
              authed ? (
                <button
                  onClick={track}
                  disabled={busy}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-neon/50 bg-neon/15 px-3 py-2 font-display text-sm font-bold tracking-widest text-neon transition hover:bg-neon/25 disabled:opacity-40"
                >
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  ОТСЛЕЖИВАТЬ
                </button>
              ) : (
                <p className="mt-3 rounded border border-amber-neon/30 bg-amber-neon/5 px-2 py-1.5 text-center font-code text-[10px] text-amber-neon">
                  войди через Steam, чтобы включить отслеживание
                </p>
              )
            ) : (
              <p className="mt-3 flex items-center justify-center gap-2 rounded-md border border-neon/40 bg-neon/10 px-2 py-1.5 font-code text-[11px] text-neon">
                <Eye size={12} /> УЖЕ ОТСЛЕЖИВАЕТСЯ
              </p>
            )}

            {tracked && notify && (
              <QuickNotify
                steamId64={result.steamId64}
                notify={notify}
                onSaved={(n) => setNotify(n)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
