import mongoose from 'mongoose';

/** Rust-сервер, который циклически опрашивается по A2S. */
const gameServerSchema = new mongoose.Schema(
  {
    host: { type: String, required: true, trim: true },
    port: { type: Number, default: 28015 },
    name: { type: String, default: '' },
    map: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
    isOnline: { type: Boolean, default: null },
    playersCount: { type: Number, default: null },
    maxPlayers: { type: Number, default: null },
    lastPolledAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

gameServerSchema.index({ host: 1, port: 1 }, { unique: true });

gameServerSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    host: this.host,
    port: this.port,
    name: this.name,
    map: this.map,
    active: this.active,
    isOnline: this.isOnline,
    playersCount: this.playersCount,
    maxPlayers: this.maxPlayers,
    lastPolledAt: this.lastPolledAt,
    lastError: this.lastError,
  };
};

export default mongoose.model('GameServer', gameServerSchema);
