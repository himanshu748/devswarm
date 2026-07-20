import { EventEmitter } from 'node:events';

// One process-wide feed of swarm events; the SSE endpoint and any future
// consumers (Swarm Doctor) subscribe here. Same data the spans carry.
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function emit(type, data = {}) {
  bus.emit('event', { type, ts: Date.now(), ...data });
}
