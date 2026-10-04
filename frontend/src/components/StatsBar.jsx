import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { Users, Gamepad2, Wifi, MapPin } from 'lucide-react';

/** Плавный счётчик: анимирует число от прошлого значения к новому. */
function CountUp({ value }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.7,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);

  return <>{display}</>;
}

export default function StatsBar({ total, inGame, online, onServer }) {
  const items = [
    { icon: Users, value: total, label: 'ВРАГОВ', grad: 'from-slate-400/20 to-slate-400/5', text: 'text-white' },
    { icon: Gamepad2, value: inGame, label: 'В ИГРЕ', grad: 'from-neon/25 to-neon/5', text: 'text-neon' },
    { icon: Wifi, value: online, label: 'ОНЛАЙН STEAM', grad: 'from-amber-neon/25 to-amber-neon/5', text: 'text-amber-neon' },
    { icon: MapPin, value: onServer, label: 'НА СЕРВЕРАХ', grad: 'from-cyan-400/25 to-cyan-400/5', text: 'text-cyan-300' },
  ];

  return (
    <div className="relative z-10 mx-auto max-w-7xl px-4 py-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map(({ icon: Icon, value, label, grad, text }, i) => (
          <div
            key={label}
            className="glass sheen fade-in group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:border-neon/25 hover:shadow-2xl hover:shadow-neon/5"
            style={{ animationDelay: `${0.08 * i}s` }}
          >
            {/* акцентный блик в углу при hover */}
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-neon/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
            <div className="relative flex items-center gap-3.5">
              <div
                className={`rounded-xl border border-white/10 bg-gradient-to-br p-2.5 ${grad} transition-transform duration-300 group-hover:scale-110`}
              >
                <Icon size={20} className={text} />
              </div>
              <div>
                <div className={`font-display text-2xl font-bold leading-none ${text}`}>
                  <CountUp value={value} />
                </div>
                <div className="mt-1 font-code text-[10px] tracking-[0.18em] text-ghost">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
