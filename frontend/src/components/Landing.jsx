import { motion } from 'framer-motion';
import { Radar, Crosshair, Activity, Clock3, ArrowRight } from 'lucide-react';

const SteamIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9.5" />
    <circle cx="15.2" cy="8.8" r="3" />
    <path d="M2.6 13.4l7 2.6" />
    <circle cx="9.4" cy="16.2" r="2" fill="currentColor" stroke="none" />
  </svg>
);

const features = [
  {
    icon: Crosshair,
    title: 'ДВА СПОСОБА СЛЕЖКИ',
    text: 'Steam Web API следит, когда враг запустил Rust, а A2S-протокол находит его на сервере',
  },
  {
    icon: Activity,
    title: 'ТОЧНЫЙ СЕРВЕР',
    text: 'Мы показываем название сервера, где враг сидит прямо сейчас — как только он зашёл',
  },
  {
    icon: Clock3,
    title: 'ИСТОРИЯ И ГРАФИКИ',
    text: 'Время захода, выхода, сколько часов в игре — всё сохраняется и рисуется на графике',
  },
];

export default function Landing({ user, onEnter, authError }) {
  const title = 'RUST RADAR';

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
      {/* расходящиеся круги радара */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neon/15"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.15], opacity: [0.45, 0] }}
            transition={{ duration: 3.8, repeat: Infinity, delay: i * 1.25, ease: 'easeOut' }}
          />
        ))}
      </div>

      {/* баннер неудачного входа */}
      {authError && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass mb-6 rounded-xl border-alert/40 px-5 py-2.5 font-code text-xs text-alert"
        >
          ⚠️ ВХОД ЧЕРЕЗ STEAM НЕ УДАЛСЯ (причина: {authError}) — попробуй ещё раз
        </motion.div>
      )}

      {/* заголовок */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative mb-3 flex items-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
          className="text-neon/70"
        >
          <Radar size={38} />
        </motion.div>
        <h1 className="flex font-display text-5xl font-bold tracking-[0.16em] sm:text-7xl">
          {title.split('').map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 46, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.06 * i, type: 'spring', stiffness: 240, damping: 20 }}
              className="grad-text"
            >
              {ch === ' ' ? '\u00A0' : ch}
            </motion.span>
          ))}
        </h1>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75 }}
        className="mb-10 max-w-xl text-center font-code text-xs leading-relaxed text-ghost sm:text-sm"
      >
        ТАКТИЧЕСКАЯ СИСТЕМА СЛЕЖКИ ЗА ВРАГАМИ В RUST.
        <br />
        ЗНАЙ, КОГДА ОНИ В ИГРЕ — И НА КАКОМ ИМЕННО СЕРВЕРЕ.
      </motion.p>

      {/* кнопки */}
      <motion.div
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.95 }}
        className="mb-16 flex flex-col items-center gap-4 sm:flex-row"
      >
        {user ? (
          <button
            onClick={onEnter}
            className="btn-shine group relative flex items-center gap-3 rounded-xl border border-neon/40 bg-gradient-to-r from-neon/15 via-neon/10 to-cyan-400/10 px-9 py-4 font-display text-lg font-bold tracking-widest text-neon shadow-2xl shadow-neon/20 transition-all duration-300 hover:scale-[1.03] hover:border-neon/70 hover:shadow-neon/30 active:scale-95"
          >
            <SteamIcon /> ОТКРЫТЬ РАДАР{' '}
            <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1.5" />
          </button>
        ) : (
          <a
            href="/api/auth/steam"
            className="btn-shine group relative flex items-center gap-3 rounded-xl border border-neon/40 bg-gradient-to-r from-neon/15 via-neon/10 to-cyan-400/10 px-9 py-4 font-display text-lg font-bold tracking-widest text-neon shadow-2xl shadow-neon/20 transition-all duration-300 hover:scale-[1.03] hover:border-neon/70 hover:shadow-neon/30 active:scale-95"
          >
            <SteamIcon /> ВОЙТИ ЧЕРЕЗ STEAM
          </a>
        )}
        {!user && (
          <button
            onClick={onEnter}
            className="font-code text-xs text-ghost underline-offset-4 transition hover:text-neon hover:underline"
          >
            продолжить без входа → общий список
          </button>
        )}
      </motion.div>

      {/* фичи: stagger при появлении и при скролле */}
      <div className="grid w-full max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, text }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: i * 0.14, type: 'spring', stiffness: 160, damping: 20 }}
            whileHover={{ y: -8 }}
            className="glass sheen group relative rounded-2xl p-6 transition-all duration-300 hover:border-neon/30 hover:shadow-2xl hover:shadow-neon/10"
          >
            <div className="mb-4 inline-flex rounded-xl border border-neon/20 bg-neon/10 p-2.5 text-neon shadow-[0_0_20px_rgba(52,255,143,0.15)] transition-transform duration-300 group-hover:scale-110">
              <Icon size={24} />
            </div>
            <h3 className="mb-2 font-display text-base font-bold tracking-wider text-white">{title}</h3>
            <p className="font-code text-[11px] leading-relaxed text-ghost">{text}</p>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.45 }}
        transition={{ delay: 1.9 }}
        className="animate__animated animate__fadeIn mt-16 font-code text-[10px] tracking-widest text-ghost"
      >
        APPID 252490 · STEAM WEB API + A2S · СДЕЛАНО ДЛЯ ОХОТНИКОВ ЗА ВРАГАМИ
      </motion.p>
    </div>
  );
}
