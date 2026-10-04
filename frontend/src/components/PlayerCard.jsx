import { useState } from 'react';
import { motion } from 'framer-motion';
import { Gamepad2, MapPin, Wifi, Clock, Trash2, ChevronRight, Copy, Check } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { playerStatus, timeAgo } from '../api.js';

const STATUS = {
  ingame: { label: 'В ИГРЕ', text: 'text-neon', glow: true, icon: Gamepad2 },
  rust: { label: 'В ИГРЕ · RUST', text: 'text-neon', glow: true, icon: Gamepad2 },
  onserver: { label: 'НА СЕРВЕРЕ', text: 'text-neon', glow: true, icon: MapPin },
  online: { label: 'В СЕТИ · STEAM', text: 'text-amber-neon', glow: false, icon: Wifi },
  offline: { label: 'ОФФЛАЙН', text: 'text-alert', glow: false, icon: Clock },
};

export default function PlayerCard({ player, index = 0, onOpen, onRemove }) {
  const status = playerStatus(player);
  const meta = STATUS[status];
  const Icon = meta.icon;
  const lastSeen = player.lastSeenInRustAt || player.lastSeenOnlineAt;
  const offline = status === 'offline';

  // имя и адрес сервера (если имя не резолвнулось — в name лежит сам адрес)
  const [copiedAddr, setCopiedAddr] = useState(false);
  const cs = player.currentServer;
  const serverAddr = cs ? `${cs.host}:${cs.port}` : null;
  const serverName = cs ? (cs.name && cs.name !== serverAddr ? cs.name : null) : null;
  const copyAddr = (e) => {
    e.stopPropagation();
    if (!serverAddr) return;
    navigator.clipboard?.writeText(serverAddr).then(() => {
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1500);
    });
  };

  return (
    <motion.div
      layout
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -6 }}
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index * 0.06, 0.4)}s` }}
      className="fade-in group relative cursor-pointer"
    >
      {/* рамка: у «в игре» — вращающийся неоновый градиент, у остальных — статичный градиент */}
      <div
        className={`relative overflow-hidden rounded-2xl p-[1.5px] transition-shadow duration-500 ${
          meta.glow
            ? 'shadow-[0_14px_60px_-12px_rgba(52,255,143,0.4)]'
            : offline
              ? 'shadow-[0_10px_40px_-14px_rgba(0,0,0,0.8)]'
              : 'shadow-[0_14px_50px_-14px_rgba(255,179,64,0.3)]'
        }`}
      >
        {meta.glow && (
          <div
            className="absolute left-1/2 top-1/2 h-[320%] w-[320%] -translate-x-1/2 -translate-y-1/2 animate-[spin_4.5s_linear_infinite]"
            style={{
              background:
                'conic-gradient(transparent 0deg, transparent 290deg, rgba(52,255,143,0.95) 335deg, rgba(43,212,255,0.7) 355deg, transparent 360deg)',
            }}
          />
        )}

        {/* тело: ЧЁТКО светлее фона страницы, собственная видимая граница */}
        <div
          className={`relative rounded-[15px] border p-5 transition-colors duration-300 ${
            meta.glow
              ? 'border-neon/30 bg-gradient-to-b from-[#1b2735] to-[#10161f] group-hover:border-neon/55'
              : offline
                ? 'border-alert/25 bg-gradient-to-b from-[#1c1720] to-[#100d13] group-hover:border-alert/50'
                : 'border-amber-neon/25 bg-gradient-to-b from-[#231d12] to-[#15110a] group-hover:border-amber-neon/50'
          }`}
        >
          {/* блик по верхней кромке */}
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {/* пульсирующие радар-кольца */}
          {meta.rings && (
            <>
              <div className="radar-ring" />
              <div className="radar-ring" style={{ animationDelay: '1.3s' }} />
            </>
          )}

          {/* шапка */}
          <div className="relative flex items-start gap-4">
            <div className="relative shrink-0">
              <Avatar
                src={player.avatar}
                className={`h-16 w-16 rounded-xl border object-cover transition-transform duration-300 group-hover:scale-[1.06] ${
                  meta.glow
                    ? 'border-neon/60 shadow-[0_0_22px_rgba(52,255,143,0.4)]'
                    : offline
                      ? 'border-white/10 opacity-75 grayscale'
                      : 'border-amber-neon/50'
                }`}
              />
              {meta.glow && (
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-panel bg-neon shadow-[0_0_12px_rgba(52,255,143,1)]" />
              )}
              {offline && (
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-panel bg-alert/90" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3
                className={`truncate font-display text-[22px] font-bold leading-tight ${
                  offline ? 'text-alert/90' : 'text-white'
                }`}
              >
                {player.nickname || 'НЕИЗВЕСТЕН'}
              </h3>
              <p className="mt-0.5 font-code text-[11px] text-ghost/80">{player.steamId64}</p>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title="Убрать из радара"
              className="rounded-lg p-1.5 text-ghost/70 opacity-0 transition-all duration-300 hover:bg-alert/10 hover:text-alert group-hover:opacity-100"
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* статус-полоса на всю ширину */}
          <div
            className={`relative mt-4 flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${
              meta.glow
                ? 'border-neon/35 bg-neon/15'
                : offline
                  ? 'border-alert/30 bg-alert/10'
                  : 'border-amber-neon/35 bg-amber-neon/10'
            }`}
          >
            <span className={`flex items-center gap-2 font-display text-sm font-bold tracking-wider ${meta.text}`}>
              <Icon size={15} />
              {meta.label}
            </span>
            {meta.glow && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon" />
              </span>
            )}
          </div>

          {/* сервер: название + адрес с копированием */}
          {cs && (
            <div className="relative mt-4 rounded-xl border border-neon/20 bg-neon/[0.06] px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <MapPin size={14} className="shrink-0 text-neon" />
                  <span className="truncate font-display text-sm font-bold text-white">
                    {serverName || 'Название не определено'}
                  </span>
                </span>
                <button
                  onClick={copyAddr}
                  title="Скопировать адрес сервера"
                  className={`flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 font-code text-[10px] font-bold transition-all duration-200 active:scale-95 ${
                    copiedAddr
                      ? 'border-neon/60 bg-neon/25 text-neon'
                      : 'border-neon/25 bg-neon/5 text-neon/80 hover:bg-neon/15 hover:text-neon'
                  }`}
                >
                  {copiedAddr ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
              <div className="mt-1 truncate font-code text-[10px] text-neon/70">{serverAddr}</div>
            </div>
          )}

          {/* подвал: подсказка профиля появляется на hover */}
          <div className="relative mt-3.5 flex items-center justify-between border-t border-white/10 pt-3 font-code text-[10px] text-ghost">
            <span className="flex items-center gap-1.5">
              <Clock size={10} /> БЫЛ АКТИВЕН: {timeAgo(lastSeen)}
            </span>
            <span className="flex items-center gap-1 text-neon opacity-0 transition-all duration-300 group-hover:opacity-100">
              ПРОФИЛЬ <ChevronRight size={12} />
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
