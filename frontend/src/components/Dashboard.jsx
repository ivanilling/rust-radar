import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Skull,
  Radar as RadarIcon,
  Search,
  Send,
  Server as ServerIcon,
  Eye,
} from 'lucide-react';
import { api, isInGameNow, playerStatus, beep } from '../api.js';
import Header from './Header.jsx';
import StatsBar from './StatsBar.jsx';
import PlayerCard from './PlayerCard.jsx';
import PlayerModal from './PlayerModal.jsx';
import ServerPanel from './ServerPanel.jsx';
import PlayerSearch from './PlayerSearch.jsx';
import RadarWidget from './RadarWidget.jsx';
import TelegramCard from './TelegramCard.jsx';
import Toasts, { useToasts } from './Toasts.jsx';

const IN_GAME = ['ingame', 'onserver', 'rust'];
const serverKey = (p) => (p.currentServer ? `${p.currentServer.host}:${p.currentServer.port}` : null);

/* ---------- премиальные входные анимации: CSS (не зависят от видимости вкладки) ---------- */
const RAIL_TABS = [
  { id: 'search', label: 'ПОИСК', icon: Search },
  { id: 'telegram', label: 'TG-БОТ', icon: Send },
  { id: 'servers', label: 'СЕРВЕРА', icon: ServerIcon },
];

export default function Dashboard({ user, onLogout }) {
  const [players, setPlayers] = useState([]);
  const [servers, setServers] = useState([]);
  const [apiOnline, setApiOnline] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const { toasts, pushToast } = useToasts();
  const prevRef = useRef({}); // steamId64 -> { status, serverKey }
  const playersRef = useRef([]);

  // вкладки правой панели — чисто презентационное состояние, логику не трогает
  const [railTab, setRailTab] = useState('search');

  const refreshPlayers = useCallback(async () => {
    try {
      const { data } = await api.listPlayers();
      setApiOnline(true);

      const prev = prevRef.current;
      const next = {};
      for (const p of data) {
        const status = playerStatus(p);
        const sk = serverKey(p);
        next[p.steamId64] = { status, serverKey: sk };
        const was = prev[p.steamId64];
        if (was && (was.status !== status || was.serverKey !== sk)) {
          const name = p.nickname || p.steamId64;
          const n = p.notify || {};
          let event = null;
          if (IN_GAME.includes(status) && !IN_GAME.includes(was.status)) event = 'enter';
          else if (status === 'offline' && IN_GAME.includes(was.status)) event = 'exit';
          else if (was.serverKey && sk && was.serverKey !== sk) event = 'serverChange';

          if (event && n[event] !== false) {
            const body =
              event === 'enter'
                ? `${name}${p.currentServer ? ` — ${p.currentServer.name}` : ' — запустил Rust'}`
                : event === 'exit'
                  ? `${name} покинул Rust`
                  : `${name} → ${p.currentServer?.name || 'новый сервер'}`;
            pushToast({
              type: event === 'exit' ? 'info' : 'alert',
              title:
                event === 'enter'
                  ? 'ВРАГ В СЕТИ'
                  : event === 'exit'
                    ? 'ВРАГ УШЁЛ'
                    : 'ВРАГ СМЕНИЛ СЕРВЕР',
              body,
            });
            if (n.sound !== false) beep();
          }
        }
      }
      prevRef.current = next;
      setPlayers(data);
    } catch {
      setApiOnline(false);
    }
  }, [pushToast]);

  const refreshServers = useCallback(async () => {
    try {
      const { data } = await api.listServers();
      setServers(data);
    } catch {
      /* бэкенд недоступен */
    }
  }, []);

  useEffect(() => {
    refreshPlayers();
    refreshServers();
    const t1 = setInterval(refreshPlayers, 8000);
    const t2 = setInterval(refreshServers, 20000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [refreshPlayers, refreshServers]);

  // РЕАЛЬНОЕ ВРЕМЯ: бэкенд сам пушит события через SSE —
  // карточка обновляется, тост и звук прилетают сразу, без ожидания опроса.
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const applySseEvent = useCallback(
    ({ event, player }) => {
      if (!event || !player?.steamId64) return;
      // обновляем карточку мгновенно
      setPlayers((list) => {
        const i = list.findIndex((x) => x.steamId64 === player.steamId64);
        if (i === -1) return list;
        const copy = [...list];
        copy[i] = { ...copy[i], ...player };
        return copy;
      });
      // синхронизируем прошлый статус, чтобы 8-секундный опрос не задублировал тост
      prevRef.current[player.steamId64] = {
        status: playerStatus(player),
        serverKey: player.currentServer
          ? `${player.currentServer.host}:${player.currentServer.port}`
          : null,
      };
      // тост + звук с учётом персональных настроек
      const known = playersRef.current.find((x) => x.steamId64 === player.steamId64);
      const n = known?.notify || {};
      if (n[event] === false) return;
      const name = player.nickname || player.steamId64;
      const map = {
        enter: ['alert', 'ВРАГ В СЕТИ', `${name}${player.currentServer ? ` — ${player.currentServer.name}` : ''}`],
        exit: ['info', 'ВРАГ УШЁЛ', `${name} покинул Rust`],
        serverChange: ['alert', 'ВРАГ СМЕНИЛ СЕРВЕР', `${name} → ${player.currentServer?.name || 'новый сервер'}`],
      };
      const [type, title, body] = map[event] || [];
      if (title) {
        pushToast({ type, title, body });
        if (n.sound !== false) beep();
      }
    },
    [pushToast]
  );

  useEffect(() => {
    const es = new EventSource('/api/track/events');
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.event) applySseEvent(payload);
      } catch {
        /* битый чанк — игнорируем */
      }
    };
    es.onerror = () => {
      /* EventSource сам переподключится */
    };
    return () => es.close();
  }, [applySseEvent]);

  const manualScan = async () => {
    setScanning(true);
    try {
      await api.runTracker();
    } catch {
      /* видно по статусу API */
    }
    await refreshPlayers();
    await refreshServers();
    setScanning(false);
  };

  const removePlayer = async (p) => {
    if (!window.confirm(`Убрать «${p.nickname || p.steamId64}» из радара?`)) return;
    try {
      await api.removePlayer(p.steamId64);
      await refreshPlayers();
    } catch (e) {
      pushToast({ type: 'info', title: 'ОШИБКА', body: e.message });
    }
  };

  const inGame = players.filter(isInGameNow);

  return (
    <>
      <Toasts toasts={toasts} />
      <Header apiOnline={apiOnline} user={user} onScan={manualScan} scanning={scanning} onLogout={onLogout} />

      {!user && (
        <div className="border-b border-amber-neon/15 bg-amber-neon/[0.06] px-4 py-2 text-center font-code text-[11px] text-amber-neon">
          режим без входа: показывается общий список · войди через Steam, чтобы вести личный watchlist
        </div>
      )}

      <StatsBar
        total={players.length}
        inGame={inGame.length}
        online={players.filter((p) => p.isOnline).length}
        onServer={players.filter((p) => p.currentServer).length}
      />

      {/* ================= КОМАНДНЫЙ ЦЕНТР ================= */}
      <main className="relative z-10 mx-auto max-w-[1440px] px-4 pb-20 lg:px-6">
        <div className="grid grid-cols-1 gap-7 xl:grid-cols-[380px_minmax(0,1fr)]">
          {/* ---------- ЛЕВАЯ КОЛОНКА: радар + инструменты (sticky) ---------- */}
          <aside className="fade-in space-y-5 xl:sticky xl:top-[92px] xl:self-start" style={{ animationDelay: '0.15s' }}>
            <RadarWidget players={inGame} />

            {/* переключатель инструментов */}
            <div className="glass rounded-2xl p-1.5">
              <div className="grid grid-cols-3 gap-1">
                {RAIL_TABS.map(({ id, label, icon: Icon }) => {
                  const active = railTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setRailTab(id)}
                      className={`relative flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 font-display text-[12px] font-bold tracking-wider transition-colors duration-200 ${
                        active ? 'text-void' : 'text-ghost hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="railTabPill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-xl bg-gradient-to-r from-neon to-[#2bd4ff] shadow-[0_0_22px_rgba(52,255,143,0.35)]"
                        />
                      )}
                      <Icon size={13} className="relative z-10" />
                      <span className="relative z-10">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* содержимое вкладки: плавная смена без залипаний */}
            <div key={railTab} className="animate__animated animate__fadeIn animate__faster">
              {railTab === 'search' && (
                <PlayerSearch
                  authed={Boolean(user)}
                  onAdded={refreshPlayers}
                  onError={(m) => pushToast({ type: 'info', title: 'ОШИБКА', body: m })}
                />
              )}
              {railTab === 'telegram' && <TelegramCard authed={Boolean(user)} onToast={pushToast} />}
              {railTab === 'servers' && <ServerPanel servers={servers} onChange={refreshServers} onToast={pushToast} />}
            </div>
          </aside>

          {/* ---------- ПРАВАЯ ЗОНА: данные радара ---------- */}
          <section className="fade-in" style={{ animationDelay: '0.28s'}}>
            <div className="mb-5 flex items-center gap-4">
              <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-widest text-white">
                <RadarIcon size={20} className="text-neon" />
                РАДАР ВРАГОВ
              </h2>
              <span className="rounded-full border border-neon/25 bg-neon/10 px-2.5 py-0.5 font-code text-[11px] font-semibold text-neon">
                {players.length}
              </span>
              <div className="hidden h-px flex-1 bg-gradient-to-r from-neon/30 via-neon/10 to-transparent sm:block" />
              <span className="hidden items-center gap-2 font-code text-[10px] tracking-widest text-ghost md:flex">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-neon" />
                </span>
                СЛЕЖКА АКТИВНА
              </span>
            </div>

            {players.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass sheen flex flex-col items-center gap-5 rounded-3xl py-24 text-ghost"
              >
                <span className="relative rounded-3xl border border-edge bg-white/[0.03] p-5">
                  <span className="radar-ring rounded-3xl" />
                  <Skull size={48} className="opacity-60" />
                </span>
                <p className="font-display text-xl tracking-[0.2em] text-white/80">ЦЕЛЕЙ НЕ ОБНАРУЖЕНО</p>
                <p className="max-w-sm text-center text-sm leading-relaxed">
                  Найди врага через «ПОИСК» слева и нажми «Отслеживать» —
                  радар начнёт следить за ним автоматически
                </p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {players.map((p, i) => (
                    <PlayerCard
                      key={p.steamId64}
                      player={p}
                      index={i}
                      onOpen={() => setSelectedId(p.steamId64)}
                      onRemove={() => removePlayer(p)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </div>

        {/* подвал-подсказка */}
        <p
          className="fade-in mt-14 flex items-center justify-center gap-2 text-center font-code text-[10px] tracking-widest text-ghost/60"
          style={{ animationDelay: '0.45s' }}
        >
          <Eye size={11} />
          ДАННЫЕ ОБНОВЛЯЮТСЯ В РЕАЛЬНОМ ВРЕМЕНИ · ИСТОЧНИКИ: STEAM WEB API + A2S + GAMESERVERIP
        </p>
      </main>

      <AnimatePresence>
        {selectedId && <PlayerModal steamId64={selectedId} onClose={() => setSelectedId(null)} />}
      </AnimatePresence>
    </>
  );
}
