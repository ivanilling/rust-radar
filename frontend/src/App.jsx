import { motion } from 'framer-motion';
import AuthGate from './components/AuthGate.jsx';

/** Медленно дрейфующие градиентные орбы — фон с глубиной. */
function Orb({ className, delay = 0, drift = 60 }) {
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute rounded-full blur-[110px] ${className}`}
      animate={{ x: [0, drift, -drift / 2, 0], y: [0, -drift / 2, drift, 0] }}
      transition={{ duration: 26 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

export default function App() {
  return (
    <div className="scanlines relative min-h-screen overflow-x-clip bg-void">
      {/* фон: сетка + орбы + частицы */}
      <div className="grid-bg pointer-events-none fixed inset-0" />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <Orb className="left-[-10%] top-[-15%] h-[480px] w-[480px] bg-neon/10" />
        <Orb className="right-[-12%] top-[20%] h-[420px] w-[420px] bg-cyan-400/8" delay={4} drift={80} />
        <Orb className="bottom-[-20%] left-[30%] h-[520px] w-[520px] bg-neon/8" delay={9} drift={50} />
        {[...Array(14)].map((_, i) => (
          <span
            key={i}
            className="absolute h-1 w-1 animate-[floaty_6s_ease-in-out_infinite] rounded-full bg-neon/30"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              animationDelay: `${i * 0.45}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10">
        <AuthGate />
      </div>
    </div>
  );
}
