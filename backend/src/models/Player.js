import mongoose from 'mongoose';

/**
 * Отслеживаемый игрок («враг» из watchlist).
 * История онлайна хранится встроенным массивом onlineHistory (кольцевой буфер, см. trackerService)
 * и расширенной историей сессий в коллекции TrackingSession.
 */
const onlineSnapshotSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    online: { type: Boolean, default: false },   // онлайн в Steam
    inRust: { type: Boolean, default: false },   // запущена ли Rust (по Steam)
    onServer: { type: Boolean, default: null },  // замечен ли на Rust-сервере (по A2S)
  },
  { _id: false }
);

const currentServerSchema = new mongoose.Schema(
  {
    host: String,
    port: Number,
    name: String,
    matchedBy: { type: String, enum: ['steamid', 'nickname', 'gameserverip'] },
    updatedAt: Date,
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    steamId64: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{17}$/,
    },
    nickname: { type: String, default: '' },
    // нормализованный ник для A2S-матчинга (lowercase, схлопнутые пробелы)
    nicknameNormalized: { type: String, default: '', index: true },
    avatar: { type: String, default: '' },
    profileUrl: { type: String, default: '' },

    active: { type: Boolean, default: true, index: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // кэш текущего статуса (обновляется trackerService)
    isOnline: { type: Boolean, default: false },  // онлайн в Steam
    isInRust: { type: Boolean, default: false },  // запущена Rust
    steamStatus: {
      personaState: { type: Number, default: 0 },
      lastLogoff: { type: Date, default: null },
      gameExtraInfo: { type: String, default: null },
      updatedAt: { type: Date, default: null },
    },

    currentServer: { type: currentServerSchema, default: null }, // где сидит прямо сейчас (A2S)
    lastSeenOnlineAt: { type: Date, default: null },
    lastSeenInRustAt: { type: Date, default: null },
    lastSeenOnServerAt: { type: Date, default: null },

    // кольцевой буфер снапшотов (пушится с $slice, см. trackerService)
    onlineHistory: { type: [onlineSnapshotSchema], default: [], select: false },
  },
  { timestamps: true }
);

playerSchema.index({ active: 1, isInRust: 1 });

playerSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    steamId64: this.steamId64,
    nickname: this.nickname,
    avatar: this.avatar,
    profileUrl: this.profileUrl,
    active: this.active,
    isOnline: this.isOnline,
    isInRust: this.isInRust,
    steamStatus: this.steamStatus,
    currentServer: this.currentServer,
    lastSeenOnlineAt: this.lastSeenOnlineAt,
    lastSeenInRustAt: this.lastSeenInRustAt,
    lastSeenOnServerAt: this.lastSeenOnServerAt,
    createdAt: this.createdAt,
  };
};

/** Кольцевой буфер: держим последние N снапшотов истории онлайна. */
export const ONLINE_HISTORY_LIMIT = 288; // ~4.8 часа при опросе раз в минуту

export const normalizeNickname = (name) =>
  String(name || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

playerSchema.virtual('publicCurrentServer').get(() => null);

export default mongoose.model('Player', playerSchema);
