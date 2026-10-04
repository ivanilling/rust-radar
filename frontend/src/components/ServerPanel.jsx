import { useState } from 'react';
import { RefreshCw, Trash2, Server as ServerIcon, Search } from 'lucide-react';
import { api } from '../api.js';

function ServerListEntry({ server, onScan, onRemove, busy }) {
  return (
    <div className="flex items-center gap-2 rounded border border-edge bg-panel2 px-3 py-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          server.isOnline
            ? 'bg-neon shadow-[0_0_6px_rgba(52,255,143,0.9)]'
            : 'bg-alert shadow-[0_0_6px_rgba(255,59,92,0.8)]'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-sm font-semibold">
          {server.name || `${server.host}:${server.port}`}
        </div>
        <div className="font-code text-[10px] text-ghost">
          {server.host}:{server.port}
          {server.playersCount != null && ` · ${server.playersCount}/${server.maxPlayers ?? '?'}`}
          {server.lastError && ' · недоступен'}
        </div>
      </div>
      <button
        onClick={onScan}
        disabled={busy}
        title="Сканировать сейчас"
        className="rounded p-1.5 text-ghost transition hover:bg-edge hover:text-neon disabled:opacity-40"
      >
        <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
      </button>
      <button
        onClick={onRemove}
        title="Убрать сервер"
        className="rounded p-1.5 text-ghost transition hover:bg-alert/10 hover:text-alert"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function AddServerForm({ onAdded, onError }) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('28015');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!host.trim() || busy) return;
    setBusy(true);
    try {
      await api.addServer(host.trim(), Number(port) || 28015);
      setHost('');
      onAdded?.();
    } catch (err) {
      onError?.(err.message);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="IP или домен"
          className="min-w-0 flex-1 rounded-md border border-edge bg-panel2 px-3 py-2 font-code text-xs text-white placeholder:text-ghost/50 focus:border-neon/50 focus:outline-none"
        />
        <input
          value={port}
          onChange={(e) => setPort(e.target.value)}
          className="w-20 rounded-md border border-edge bg-panel2 px-2 py-2 font-code text-xs text-white focus:border-neon/50 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !host.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-edge bg-panel2 px-3 py-2 font-display text-sm font-semibold tracking-wider text-ghost transition hover:border-neon/40 hover:text-neon disabled:opacity-40"
      >
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
        ДОБАВИТЬ СЕРВЕР
      </button>
    </form>
  );
}

export default function ServerPanel({ servers, onChange, onToast }) {
  const [busyId, setBusyId] = useState(null);

  const scanOne = async (server) => {
    setBusyId(server.id);
    try {
      const { data } = await api.scanServer(server.id);
      if (data.matched?.length > 0) {
        onToast({
          type: 'alert',
          title: 'ЦЕЛИ НА СЕРВЕРЕ',
          body: `${data.matched.map((m) => m.nickname).join(', ')}`,
        });
      } else if (data.error) {
        onToast({ type: 'raw', title: 'СКАН', body: `Сервер не ответил: ${data.error}` });
      } else {
        onToast({ type: 'raw', title: 'СКАН', body: 'Наши в списке не найдены' });
      }
      await onChange();
    } catch (e) {
      onToast({ type: 'info', title: 'ОШИБКА', body: e.message });
    }
    setBusyId(null);
  };

  const removeOne = async (server) => {
    try {
      await api.deleteServer(server.id);
      await onChange();
    } catch (e) {
      onToast({ type: 'info', title: 'ОШИБКА', body: e.message });
    }
  };

  return (
    <div className="glass sheen rounded-2xl p-5">
      <h3 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold tracking-widest text-white">
        <ServerIcon size={15} className="text-neon" /> СЕРВЕРЫ ДЛЯ СКАНА
      </h3>
      <p className="mb-4 font-code text-[10px] text-ghost">
        A2S-опрос: если враг на сервере — увидишь точное название
      </p>

      <div className="mb-4 space-y-2">
        {servers.length === 0 && (
          <p className="rounded-xl border border-dashed border-edge px-3 py-5 text-center font-code text-[11px] text-ghost">
            СЕРВЕРОВ ПОКА НЕТ
          </p>
        )}
        {servers.map((s) => (
          <ServerListEntry
            key={s.id}
            server={s}
            busy={busyId === s.id}
            onScan={() => scanOne(s)}
            onRemove={() => removeOne(s)}
          />
        ))}
      </div>

      <AddServerForm onAdded={onChange} onError={(m) => onToast({ type: 'info', title: 'ОШИБКА', body: m })} />
    </div>
  );
}
