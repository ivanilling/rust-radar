import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, Server, BellRing, Copy, Check } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Avatar from './Avatar.jsx';
import { api, playerStatus, fmtDuration } from '../api.js';

const STATUS_META = {
  ingame: { label: 'В ИГРЕ (RUST)', cls: 'text-neon', dot: 'bg-neon', ring: 'ring-neon/50' },
  rust: { label: 'В ИГРЕ (RUST)', cls: 'text-neon', dot: 'bg-neon', ring: 'ring-neon/50' },
  onserver: { label: 'НА СЕРВЕРЕ', cls: 'text-neon', dot: 'bg-neon', ring: 'ring-neon/40' },
  online: { label: 'ОНЛАЙН В STEAM', cls: 'text-amber-neon', dot: 'bg-amber-neon', ring: 'ring-amber-neon/40' },
  offline: { label: 'ОФФЛАЙН', cls: 'text-alert', dot: 'bg-alert', ring: 'ring-alert/40' },
};

const V_LABEL = { 0: 'ОФФ', 1: 'STEAM', 2: 'RUST' };

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass rounded-lg px-2.5 py-1.5 font-code text-[11px]">
      <div className="text-ghost">{d.time}</div>
      <div className={d.v === 0 ? 'text-alert' : d.v === 2 ? 'text-neon' : 'text-amber-neon'}>
        {d.label}
      </div>
    </div>
  );
}

/** Премиальный тумблер-переключатель. */
function Switch({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-5.5 w-10 shrink-0 rounded-full transition-all duration-300 ${
        on ? 'bg-neon/80 shadow-[0_0_12px_rgba(52,255,143,0.4)]' : 'bg-white/10'
      }`}
      style={{ height: 22, width: 40 }}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-300 ${
          on ? 'left-[21px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

const NOTIFY_ROWS = [
  { key: 'enter', label: 'Зашёл в Rust', hint: 'враг запустил игру' },
  { key: 'exit', label: 'Вышел из Rust', hint: 'враг покинул игру' },
  { key: 'serverChange', label: 'Сменил сервер', hint: 'перешёл на другой сервер' },
  { key: 'sound', label: 'Звук на сайте', hint: 'звуковой сигнал уведомлений' },
];

export default function PlayerModal({ steamId64, onClose }) {
  const [data, setData] = useState(null);
  const [notify, setNotify] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const toggle = async (key) => {
    if (!notify) return;
    const patch = { [key]: !notify[key] };
    setNotify((n) => ({ ...n, ...patch }));
    try {
      await api.updateNotify(steamId64, patch);
    } catch {
      setNotify((n) => ({ ...n, [key]: !patch[key] }));
    }
  };

  const copyId = () => {
    navigator.clipboard?.writeText(steamId64).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // имя и адрес сервера: если имя не резолвилось, бэкенд кладёт в name сам адрес
  const cs = data?.player?.currentServer;
  const serverAddr = cs ? `${cs.host}:${cs.port}` : null;
  const serverName = cs ? (cs.name && cs.name !== serverAddr ? cs.name : null) : null;
  const [copiedAddr, setCopiedAddr] = useState(false);
  const copyAddr = () => {
    if (!serverAddr) return;
    navigator.clipboard?.writeText(serverAddr).then(() => {
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1500);
    });
  };

  useEffect(() => {
    let alive = true;
    api
      .getPlayer(steamId64)
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        if (res.data.player.notify) setNotify(res.data.player.notify);
      })
      .catch((e) => alive && setError(e.message));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [steamId64, onClose]);

  const history = (data?.player?.onlineHistory || []).map((h) => {
    const v = h.inRust ? 2 : h.online ? 1 : 0;
    const at = new Date(h.at);
    return {
      v,
      time: at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      label: h.inRust ? 'В ИГРЕ RUST' : h.online ? 'ОНЛАЙН STEAM' : 'ОФФЛАЙН',
      onServer: h.onServer,
    };
  });

  const status = data ? playerStatus(data.player) : 'offline';
  const sm = STATUS_META[status];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-lg"
    >
      <motion.div
        initial={{ scale: 0.92, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 14, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="glass sheen max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-7 shadow-2xl shadow-black/70"
      >
        {/* ===== HERO: аватар + статус ===== */}
        {data && (
          <div className="relative">
            <button
              onClick={onClose}
              className="absolute right-0 top-0 rounded-xl border border-white/10 p-2 text-ghost transition-all duration-300 hover:rotate-90 hover:border-alert/40 hover:text-alert"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-5 pr-10">
              <div className="relative shrink-0">
                <Avatar
                  src={data.player.avatar}
                  className={`h-20 w-20 rounded-2xl border border-white/10 object-cover ring-4 ${sm.ring} ${
                    status === 'offline' ? 'opacity-80 grayscale' : ''
                  }`}
                />
                <span
                  className={`absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-full border-4 border-panel ${sm.dot} ${
                    status !== 'offline' ? 'animate-pulse shadow-[0_0_12px_currentColor]' : ''
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-3xl font-bold leading-tight text-white">
                  {data.player.nickname || 'НЕИЗВЕСТЕН'}
                </h2>
                <button
                  onClick={copyId}
                  className="group/id mt-1 flex items-center gap-1.5 font-code text-xs text-ghost transition-colors hover:text-neon"
                  title="Скопировать SteamID64"
                >
                  {data.player.steamId64}
                  {copied ? <Check size={12} className="text-neon" /> : <Copy size={12} className="opacity-50 group-hover/id:opacity-100" />}
                </button>
                <div
                  className={`mt-2 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-code text-xs font-bold tracking-wider ${sm.cls} ${
                    status === 'offline' ? 'border-alert/30 bg-alert/10' : 'border-neon/30 bg-neon/10'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
                  {sm.label}
                </div>
                {cs && (
                  <div className="mt-2.5 rounded-xl border border-neon/20 bg-neon/[0.06] p-3">
                    {/* строка 1: название сервера */}
                    <div className="flex items-center gap-2">
                      <Server size={15} className="shrink-0 text-neon" />
                      <span className="truncate font-display text-base font-bold text-white">
                        {serverName || 'Название не определено'}
                      </span>
                    </div>
                    {/* строка 2: адрес с копированием в один клик */}
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-neon/15 bg-black/40 px-2.5 py-1.5">
                      <span className="truncate font-code text-xs text-neon">{serverAddr}</span>
                      <button
                        onClick={copyAddr}
                        title="Скопировать адрес сервера"
                        className="flex shrink-0 items-center gap-1.5 rounded-md border border-neon/30 bg-neon/10 px-2 py-1 font-code text-[10px] font-bold text-neon transition-all duration-200 hover:bg-neon/20 active:scale-95"
                      >
                        {copiedAddr ? <Check size={11} /> : <Copy size={11} />}
                        {copiedAddr ? 'СКОПИРОВАНО' : 'КОПИРОВАТЬ'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ===== УВЕДОМЛЕНИЯ ===== */}
            {data.player.trackedByMe && notify && (
              <div className="mt-6 rounded-2xl border border-neon/20 bg-neon/[0.05] p-5">
                <p className="mb-3 flex items-center gap-2 font-display text-sm font-bold tracking-widest text-neon">
                  <BellRing size={15} /> УВЕДОМЛЕНИЯ · САЙТ + TELEGRAM
                </p>
                <div className="space-y-1">
                  {NOTIFY_ROWS.map(({ key, label, hint }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <div>
                        <div className={`font-display text-sm font-semibold ${notify[key] ? 'text-white' : 'text-ghost'}`}>
                          {label}
                        </div>
                        <div className="font-code text-[10px] text-ghost/70">{hint}</div>
                      </div>
                      <Switch on={notify[key]} onClick={() => toggle(key)} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== ГРАФИК ===== */}
            <h3 className="mt-6 font-display text-sm font-bold tracking-widest text-white">
              ИСТОРИЯ АКТИВНОСТИ
            </h3>
            <div className="mt-2.5 h-44 rounded-2xl border border-white/8 bg-black/30 p-2 shadow-inner">
              {history.length === 0 ? (
                <p className="flex h-full items-center justify-center font-code text-xs text-ghost">
                  ДАННЫХ ПОКА НЕТ — ЖДЁМ ЦИКЛОВ СКАНИРОВАНИЯ
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="neonFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34ff8f" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#34ff8f" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#ffffff10" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: '#8fa3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: '#ffffff15' }}
                      minTickGap={28}
                    />
                    <YAxis
                      domain={[0, 2]}
                      ticks={[0, 1, 2]}
                      tickFormatter={(v) => V_LABEL[v]}
                      tick={{ fill: '#8fa3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="stepAfter"
                      dataKey="v"
                      stroke="#34ff8f"
                      strokeWidth={2}
                      fill="url(#neonFill)"
                      isAnimationActive
                      animationDuration={900}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ===== СТАТИСТИКА ===== */}
            <div className="mt-5 grid grid-cols-2 gap-3.5">
              <div className="rounded-2xl border border-neon/15 bg-gradient-to-br from-neon/[0.08] to-transparent p-4 transition-transform duration-300 hover:scale-[1.02]">
                <div className="font-code text-[10px] tracking-widest text-ghost">ЧАСЫ В RUST · STEAM</div>
                <div className="mt-1 font-display text-2xl font-bold text-neon">
                  {fmtDuration(data.stats?.steam?.totalMinutes)}
                </div>
                <div className="font-code text-[10px] text-ghost">
                  сессий: {data.stats?.steam?.sessions ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[0.08] to-transparent p-4 transition-transform duration-300 hover:scale-[1.02]">
                <div className="font-code text-[10px] tracking-widest text-ghost">ЧАСЫ НА СЕРВЕРАХ · A2S</div>
                <div className="mt-1 font-display text-2xl font-bold text-cyan-300">
                  {fmtDuration(data.stats?.a2s?.totalMinutes)}
                </div>
                <div className="font-code text-[10px] text-ghost">
                  сессий: {data.stats?.a2s?.sessions ?? 0}
                </div>
              </div>
            </div>

            {/* ===== СЕССИИ: таймлайн ===== */}
            <h3 className="mb-3 mt-6 flex items-center gap-2 font-display text-sm font-bold tracking-widest text-white">
              <Clock size={14} className="text-neon" /> ПОСЛЕДНИЕ СЕССИИ
            </h3>
            {(data.sessions || []).length === 0 ? (
              <p className="font-code text-xs text-ghost">СЕССИЙ ЕЩЁ НЕ БЫЛО</p>
            ) : (
              <div className="relative space-y-2 border-l border-white/10 pl-5">
                {(data.sessions || []).slice(0, 8).map((s) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 transition-colors hover:border-neon/25"
                  >
                    {/* точка на таймлайне */}
                    <span
                      className={`absolute -left-[26px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${
                        s.isActive
                          ? 'bg-neon shadow-[0_0_10px_rgba(52,255,143,0.9)]'
                          : 'bg-ghost/40'
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-code text-xs">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          s.source === 'a2s'
                            ? 'bg-neon/10 text-neon'
                            : s.source === 'gameserverip'
                              ? 'bg-cyan-400/10 text-cyan-300'
                              : 'bg-white/10 text-ghost'
                        }`}
                      >
                        {s.source === 'a2s' ? 'СЕРВЕР' : s.source === 'gameserverip' ? 'STEAM·IP' : 'STEAM'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-white">
                        {s.server?.name || 'Rust (без сервера)'}
                      </span>
                      <span className="text-ghost">
                        {new Date(s.startedAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="ml-auto">
                        {s.isActive ? (
                          <span className="neon-text-green font-bold text-neon">● В ИГРЕ СЕЙЧАС</span>
                        ) : (
                          <span className="text-ghost">{fmtDuration(s.durationMinutes)}</span>
                        )}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {!data && !error && (
          <p className="py-20 text-center font-code text-sm text-ghost">ЗАГРУЗКА ДАННЫХ…</p>
        )}
        {error && <p className="py-20 text-center font-code text-sm text-alert">{error}</p>}
      </motion.div>
    </motion.div>
  );
}
