import mongoose from 'mongoose';

/**
 * История сессий врага: время захода / выхода / длительность.
 * source: 'steam' — сессия «запущена Rust» (по Steam API, без привязки к серверу);
 *         'a2s'   — сессия «найден на сервере X» (по A2S-скану, с точным названием сервера).
 * Открытая сессия: isActive=true, endedAt=null. Одна открытая на пару (steamId64, source, serverKey).
 */
const trackingSessionSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    steamId64: { type: String, required: true, index: true },
    source: { type: String, enum: ['steam', 'a2s', 'gameserverip'], required: true },
    server: {
      host: { type: String, default: null },
      port: { type: Number, default: null },
      name: { type: String, default: null },
    },
    matchedBy: { type: String, enum: ['steamid', 'nickname', 'gameserverip'], default: null },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

trackingSessionSchema.index({ steamId64: 1, source: 1, isActive: 1 });
trackingSessionSchema.index({ 'server.host': 1, 'server.port': 1 });

const serverKey = (server) =>
  server && server.host ? `${server.host}:${server.port}` : null;

/** Открыть сессию, если для этого (steamId64, source, serverKey) ещё нет открытой. */
trackingSessionSchema.statics.openIfAbsent = async function openIfAbsent({
  player,
  source,
  server = null,
  matchedBy = null,
  now = new Date(),
}) {
  const open = await this.findOne({ steamId64: player.steamId64, source, isActive: true }).sort({ startedAt: -1 });
  if (open) {
    // та же сессия (для steam server всегда null; для a2s сравниваем host:port)
    if (serverKey(open.server) === serverKey(server)) return open;
    // сменил сервер (или слетел со steam-сессии на серверную) — закрываем старую, открываем новую
    open.isActive = false;
    open.endedAt = now;
    open.durationMinutes = Math.round((now - open.startedAt) / 60000);
    await open.save();
  }
  return this.create({
    player: player._id,
    steamId64: player.steamId64,
    source,
    server,
    matchedBy,
    startedAt: now,
  });
};

/** Закрыть открытые сессии игрока. serverKey ограничивает закрытие конкретным сервером. */
trackingSessionSchema.statics.closeSessions = async function closeSessions({
  steamId64,
  source,
  server = null,
  now = new Date(),
}) {
  const filter = { steamId64, source, isActive: true };
  const key = serverKey(server);
  if (key) {
    filter['server.host'] = server.host;
    filter['server.port'] = server.port;
  }
  const sessions = await this.find(filter);
  for (const s of sessions) {
    s.isActive = false;
    s.endedAt = now;
    s.durationMinutes = Math.round((now - s.startedAt) / 60000);
    await s.save();
  }
  return sessions.length;
};

trackingSessionSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    steamId64: this.steamId64,
    source: this.source,
    server: this.server,
    matchedBy: this.matchedBy,
    startedAt: this.startedAt,
    endedAt: this.endedAt,
    durationMinutes: this.durationMinutes,
    isActive: this.isActive,
  };
};

export default mongoose.model('TrackingSession', trackingSessionSchema);
