import { useCallback, useEffect, useState } from 'react';
import { Send, RefreshCw } from 'lucide-react';
import { api } from '../api.js';

/** Карточка привязки Telegram-бота: код + ссылка на бота. */
export default function TelegramCard({ authed, onToast }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!authed) return;
    api.telegramStatus().then(({ data }) => setSt(data)).catch(() => {});
  }, [authed]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000); // ждём, пока пользователь пришлёт /link боту
    return () => clearInterval(t);
  }, [refresh]);

  const genCode = async () => {
    setBusy(true);
    try {
      const { data } = await api.telegramLink();
      setSt((s) => ({ ...s, ...data }));
    } catch (e) {
      onToast?.({ type: 'info', title: 'ОШИБКА', body: e.message });
    }
    setBusy(false);
  };

  if (!authed) {
    return (
      <div className="glass sheen rounded-2xl p-5">
        <h3 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold tracking-widest text-white">
          <Send size={15} className="text-neon" /> TELEGRAM
        </h3>
        <p className="font-code text-[10px] text-ghost">войдите через Steam, чтобы привязать бота</p>
      </div>
    );
  }

  const botLink = st?.botUsername ? `https://t.me/${st.botUsername}` : null;

  return (
    <div className="glass sheen rounded-2xl p-5">
      <h3 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold tracking-widest text-white">
        <Send size={15} className="text-neon" /> TELEGRAM
      </h3>

      {!st?.botEnabled ? (
        <p className="mt-2 font-code text-[10px] leading-relaxed text-ghost">
          Бот не настроен: создай бота у @BotFather и впиши токен в
          <span className="text-neon"> TELEGRAM_BOT_TOKEN </span> в backend/.env
        </p>
      ) : st?.linked ? (
        <p className="mt-2 rounded border border-neon/40 bg-neon/10 px-2 py-1.5 font-code text-[11px] text-neon">
          ✅ Привязано{st.telegramUsername ? `: @${st.telegramUsername}` : ''} — события будут приходить в TG по твоим настройкам
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {!st?.linkCode ? (
            <button
              onClick={genCode}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-neon/40 bg-neon/10 px-3 py-2 font-display text-sm font-semibold text-neon transition hover:bg-neon/20 disabled:opacity-40"
            >
              {busy ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              ПОЛУЧИТЬ КОД ПРИВЯЗКИ
            </button>
          ) : (
            <div className="rounded-md border border-edge bg-panel2 p-3 text-center">
              <p className="font-code text-[10px] text-ghost">пришли боту команду:</p>
              <p className="my-1.5 select-all font-code text-lg font-bold tracking-widest text-neon">
                /link {st.linkCode}
              </p>
              {botLink && (
                <a
                  href={botLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-code text-[11px] text-neon underline underline-offset-2"
                >
                  открыть бота @{st.botUsername} ↗
                </a>
              )}
              <p className="mt-1.5 font-code text-[9px] text-ghost">код живёт 10 минут</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
