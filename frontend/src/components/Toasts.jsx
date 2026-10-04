import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldAlert, WifiOff, Info } from 'lucide-react';

/** Хук очереди уведомлений. pushToast({type:'alert'|'info', title, body}) */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const pushToast = useCallback((t) => {
    const id = ++idRef.current;
    setToasts((list) => [...list.slice(-3), { id, ...t }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 6000);
  }, []);
  return { toasts, pushToast };
}

const ICONS = {
  alert: { Icon: ShieldAlert, cls: 'border-neon/50 text-neon shadow-[0_10px_40px_-10px_rgba(52,255,143,0.4)]' },
  info: { Icon: WifiOff, cls: 'border-alert/50 text-alert shadow-[0_10px_40px_-10px_rgba(255,59,92,0.35)]' },
  raw: { Icon: Info, cls: 'border-edge text-ghost' },
};

export default function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[60] flex w-[min(92vw,470px)] -translate-x-1/2 flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map(({ id, type, title, body }) => {
          const { Icon, cls } = ICONS[type] || ICONS.raw;
          return (
            <motion.div
              key={id}
              initial={{ y: -90, opacity: 0, scale: 0.85 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className={`glass sheen flex items-start gap-3.5 rounded-2xl px-4.5 py-3.5 backdrop-blur-2xl ${cls}`}
            >
              <span className="mt-0.5 shrink-0 rounded-lg border border-current/30 bg-current/10 p-1.5">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="font-display text-base font-bold tracking-widest">{title}</div>
                {body && <div className="truncate font-code text-xs text-ghost">{body}</div>}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
