import { EventEmitter } from 'node:events';

/**
 * Шина событий трекера: trackerService эмитит 'player-event',
 * SSE-роут раздаёт их подключённым вкладкам сайта (реальное время).
 */
const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emitPlayerEvent(payload) {
  bus.emit('player-event', payload);
}

export function onPlayerEvent(handler) {
  bus.on('player-event', handler);
  return () => bus.off('player-event', handler);
}

export default bus;
