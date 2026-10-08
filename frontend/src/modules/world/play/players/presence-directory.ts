import type { PresencePlayerDto } from '@insidelife/shared';
import { getSocket } from '@/common/realtime/socket';

/**
 * Who is who: positions arrive by character id (`world:players`), looks and handles by presence events. The
 * directory caches every presence it hears about (snapshot on connect, joins, and the updates the server broadcasts
 * whenever a player's session commits — at least every heartbeat for anyone outside). Module-level so it survives
 * the world remounting between inside and outside.
 */

const byId = new Map<string, PresencePlayerDto>();
const idByHandle = new Map<string, string>();
/** Handles also arrive with every position, so name tags work before any presence event about a player. */
const handleById = new Map<string, string>();
const listeners = new Set<() => void>();
let attached = false;

function put(player: PresencePlayerDto): void {
  const previous = byId.get(player.characterId);
  byId.set(player.characterId, player);
  rememberHandle(player.characterId, player.handle);
  if (!previous || previous.handle !== player.handle || JSON.stringify(previous.outfit) !== JSON.stringify(player.outfit)) {
    for (const listener of listeners) listener();
  }
}

/** Start listening (idempotent). Call before the socket connects where possible. */
export function ensurePresenceDirectory(): void {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  const socket = getSocket();
  socket.on('presence:snapshot', (players) => {
    for (const player of players) put(player);
  });
  socket.on('presence:joined', put);
  socket.on('presence:updated', put);
}

export function presenceOf(characterId: string): PresencePlayerDto | undefined {
  return byId.get(characterId);
}

export function rememberHandle(characterId: string, handle: string): void {
  handleById.set(characterId, handle);
  idByHandle.set(handle.toLowerCase(), characterId);
}

/** A player's @handle (without the @), or 'player' if we haven't heard of them yet. */
export function handleOf(characterId: string): string {
  return handleById.get(characterId) ?? 'player';
}

export function characterIdByHandle(handle: string): string | undefined {
  return idByHandle.get(handle.replace(/^@/, '').toLowerCase());
}

/** Notified when a new player's look becomes known (or changes). */
export function subscribePresence(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
