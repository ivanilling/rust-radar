import mongoose from 'mongoose';

/**
 * Связь «пользователь ↔ отслеживаемый игрок» с персональными настройками
 * уведомлений. Настройки распространяются и на сайт, и на Telegram-бота.
 */
const watchlistItemSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    notify: {
      enter: { type: Boolean, default: true },        // зашёл в Rust
      exit: { type: Boolean, default: true },         // вышел из Rust
      serverChange: { type: Boolean, default: true }, // сменил сервер
      sound: { type: Boolean, default: true },        // звук на сайте
    },
  },
  { timestamps: true }
);

watchlistItemSchema.index({ user: 1, player: 1 }, { unique: true });

watchlistItemSchema.methods.toPublic = function toPublic() {
  return {
    notify: this.notify,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('WatchlistItem', watchlistItemSchema);
