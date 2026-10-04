import { Radar, RefreshCw, LogOut } from 'lucide-react';

export default function Header({ apiOnline, user, onScan, scanning, onLogout }) {
  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        {/* логотип */}
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-neon/30 shadow-[0_0_18px_rgba(52,255,143,0.2)]">
            <div className="radar-sweep absolute inset-0" />
            <Radar size={20} className="absolute inset-0 m-auto text-neon" />
          </div>
          <div>
            <h1 className="grad-text font-display text-xl font-bold leading-none tracking-[0.2em]">
              RUST RADAR
            </h1>
            <p className="mt-0.5 font-code text-[10px] tracking-widest text-ghost/70">
              СИСТЕМА СЛЕЖКИ ЗА ВРАГАМИ · APPID 252490
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* статус API */}
          <span className="hidden items-center gap-2 rounded-full border border-edge bg-white/[0.03] px-3 py-1.5 font-code text-[11px] text-ghost sm:flex">
            <span
              className={`h-2 w-2 rounded-full ${
                apiOnline
                  ? 'bg-neon shadow-[0_0_10px_rgba(52,255,143,0.9)]'
                  : 'bg-alert shadow-[0_0_10px_rgba(255,59,92,0.9)]'
              }`}
            />
            {apiOnline ? 'СЕРВЕР ОНЛАЙН' : 'НЕТ СВЯЗИ'}
          </span>

          {/* ручной скан */}
          <button
            onClick={onScan}
            disabled={scanning}
            className="btn-shine flex items-center gap-2 rounded-xl border border-neon/35 bg-gradient-to-r from-neon/15 to-neon/5 px-4 py-2 font-display text-sm font-bold tracking-wider text-neon transition-all duration-300 hover:scale-[1.04] hover:border-neon/60 hover:shadow-[0_0_24px_rgba(52,255,143,0.25)] active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'СКАН…' : 'СКАН'}
          </button>

          {/* Steam-аккаунт */}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-white/[0.04] py-1 pl-1 pr-3 transition-colors hover:border-neon/30">
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-neon/30 to-cyan-400/20" />
                )}
                <span className="max-w-[130px] truncate font-display text-sm font-semibold text-white">
                  {user.username || 'оперативник'}
                </span>
              </div>
              <button
                onClick={onLogout}
                title="Выйти"
                className="rounded-xl border border-edge p-2 text-ghost transition-all duration-300 hover:scale-105 hover:border-alert/50 hover:text-alert"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/steam"
              className="rounded-xl border border-neon/30 bg-neon/5 px-4 py-2 font-display text-sm font-bold tracking-wider text-neon transition-all duration-300 hover:scale-[1.04] hover:border-neon/60 hover:bg-neon/15 hover:shadow-[0_0_20px_rgba(52,255,143,0.2)]"
            >
              ВОЙТИ ЧЕРЕЗ STEAM
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
