import mongoose from 'mongoose';

/** Пользователь (вход через Steam OpenID, Этап 1). */
const userSchema = new mongoose.Schema(
  {
    steamId64: { type: String, required: true, unique: true },
    username: { type: String, default: '' },
    avatar: { type: String, default: '' },
    profileUrl: { type: String, default: '' },
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }], // legacy (Этап 3), живёт в WatchlistItem
    // Telegram-привязка
    telegramChatId: { type: String, default: null, index: true },
    telegramUsername: { type: String, default: null },
    tgLinkCode: { type: String, default: null, index: true },
    tgLinkCodeExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    steamId64: this.steamId64,
    username: this.username,
    avatar: this.avatar,
    profileUrl: this.profileUrl,
    watchlist: this.watchlist,
  };
};

export default mongoose.model('User', userSchema);
