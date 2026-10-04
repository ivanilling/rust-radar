import { motion } from 'framer-motion';
import { Crosshair } from 'lucide-react';

/** Детерминированный «угол» игрока на радаре (по SteamID), чтобы блипы не прыгали. */
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const angleOf = (id) => hash(id) % 360;
const distOf = (id) => 22 + (hash(id.slice(3)) % 62); // 22–84% радиуса

/**
 * Круглый тактический радар: враги «в игре» — блипы с пульсом.
 * Позиция фиксирована по SteamID (стабильна между обновлениями).
 */
export default function RadarWidget({ players }) {
  const size = 260;
  const r = size / 2;

  return (
    <div className="glass sheen rounded-2xl p-5 shadow-2xl shadow-black/40">
      <h3 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold tracking-widest text-white">
        <Crosshair size={15} className="text-neon" /> ТАКТИЧЕСКИЙ РАДАР
      </h3>
      <p className="mb-4 font-code text-[10px] text-ghost">
        {players.length > 0
          ? `${players.length} врагов в игре прямо сейчас`
          : 'все цели неактивны — ждём захода'}
      </p>

      <div
        className="relative mx-auto overflow-hidden rounded-full border border-neon/25 bg-panel2"
        style={{ width: size, height: size }}
      >
        {/* кольца */}
        {[0.33, 0.66, 1].map((k) => (
          <div
            key={k}
            className="absolute rounded-full border border-neon/12"
            style={{
              inset: size * (1 - k) / 2,
            }}
          />
        ))}
        {/* перекрестие */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-neon/10" />
        <div className="absolute left-0 top-1/2 h-px w-full bg-neon/10" />

        {/* вращающийся луч */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, rgba(52,255,143,0.35) 0deg, rgba(52,255,143,0.05) 70deg, transparent 140deg, transparent 360deg)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />

        {/* центр — ты */}
        <div className="absolute left-1/2 top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />

        {/* блипы врагов */}
        {players.map((p) => {
          const a = (angleOf(p.steamId64) * Math.PI) / 180;
          const d = (distOf(p.steamId64) / 100) * r;
          const x = r + Math.cos(a) * d;
          const y = r + Math.sin(a) * d;
          return (
            <motion.div
              key={p.steamId64}
              className="absolute z-20"
              style={{ left: x, top: y }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            >
              <div className="relative -translate-x-1/2 -translate-y-1/2">
                <span className="absolute inset-0 animate-ping rounded-full bg-alert/60" />
                <span className="relative block h-2.5 w-2.5 rounded-full bg-alert shadow-[0_0_12px_rgba(255,59,92,0.95)]" />
                <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded border border-alert/40 bg-void/90 px-1.5 py-0.5 font-code text-[9px] text-alert">
                  {(p.nickname || p.steamId64).slice(0, 14)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
