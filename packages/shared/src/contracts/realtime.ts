import type { Appearance, Gender, Outfit } from '../catalog/appearance.js';
import type { NotificationDto } from './core.js';
import type { MilestoneMomentDto } from './progression.js';
import type { VehicleModel } from '../catalog/vehicles.js';

/**
 * Socket.IO contract for the `/realtime` namespace. Authentication: `auth: { token: <accessToken> }` in the
 * handshake. The server is authoritative; clients only send chat and presence intents.
 */

export const REALTIME_NAMESPACE = '/realtime';

export interface PresencePlayerDto {
  readonly characterId: string;
  readonly handle: string;
  readonly firstName: string;
  readonly gender: Gender;
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly locationId: string;
  readonly activity: string | null;
  readonly status: number;
}

export const CHAT_CHANNEL_KINDS = ['global', 'venue', 'dm'] as const;
export type ChatChannelKind = (typeof CHAT_CHANNEL_KINDS)[number];

export interface ChatMessageDto {
  readonly id: string;
  /** `global`, `venue:<venueId>` or `dm:<characterIdA>:<characterIdB>` (ids sorted). */
  readonly channel: string;
  readonly sender: { readonly characterId: string; readonly handle: string; readonly firstName: string; readonly status: number };
  readonly body: string;
  readonly createdAt: string;
}

/** One private conversation in the player's DM list (newest first). */
export interface DmThreadDto {
  /** `dm:<characterIdA>:<characterIdB>` (ids sorted). */
  readonly channel: string;
  readonly counterpart: { readonly characterId: string; readonly handle: string; readonly firstName: string; readonly lastName: string };
  readonly lastMessageAt: string;
  /** First 120 characters of the latest message. */
  readonly preview: string;
  /** True when the latest message came from me. */
  readonly lastFromMe: boolean;
  /** A message from them arrived after I last opened the thread. */
  readonly unread: boolean;
}

export interface ChatSendPayload {
  readonly channel: string;
  readonly body: string;
}

/** Open-world movement (visual only — never trusted for game logic). */
export interface WorldMovePayload {
  readonly x: number;
  readonly z: number;
  /** Radians. */
  readonly heading: number;
  readonly mode: 'walk' | 'car';
  /** m/s, for animation blending and extrapolation. */
  readonly speed: number;
  /** While driving: what the car looks like to others (cosmetic; the server checks the model and colour format). */
  readonly vehicle?: WorldVehicleLook;
}

export interface WorldVehicleLook {
  readonly model: VehicleModel;
  /** `#rrggbb`. */
  readonly color: string;
}

export interface WorldPlayerPositionDto extends WorldMovePayload {
  readonly characterId: string;
  /** For name tags before any presence event about this player has arrived. */
  readonly handle: string;
  /** Server receive time (ms) for interpolation. */
  readonly t: number;
}

export interface SprayEventDto {
  readonly venueId: string;
  readonly fromHandle: string;
  readonly toHandle: string;
  readonly amount: number;
}

/** Events the server emits. */
export interface ServerToClientEvents {
  'presence:snapshot': (players: readonly PresencePlayerDto[]) => void;
  'presence:joined': (player: PresencePlayerDto) => void;
  'presence:updated': (player: PresencePlayerDto) => void;
  'presence:left': (payload: { readonly characterId: string }) => void;
  'chat:message': (message: ChatMessageDto) => void;
  'notification': (notification: NotificationDto) => void;
  /** Something about my character changed server-side (transfer received, event created): refetch the snapshot. */
  'character:invalidate': (payload: { readonly reason: string }) => void;
  'party:spray': (spray: SprayEventDto) => void;
  'world:online-count': (payload: { readonly count: number }) => void;
  /** Batched positions of players in your district (and neighbours), ~4 Hz. */
  'world:players': (positions: readonly WorldPlayerPositionDto[]) => void;
  /** A milestone moment (first salary, graduation, wedding…) is ready to celebrate full-screen. */
  'progression:milestone': (moment: MilestoneMomentDto) => void;
  /** A billboard ad was approved or removed: refetch the live billboard feed. */
  'billboards:updated': (payload: { readonly slotIds: readonly string[] }) => void;
}

/** Events the client emits. Acks return `{ ok: true }` or `{ ok: false, error }`. */
export interface ClientToServerEvents {
  'chat:send': (payload: ChatSendPayload, ack: (result: RealtimeAck) => void) => void;
  'chat:join': (payload: { readonly channel: string }, ack: (result: RealtimeAck) => void) => void;
  'chat:leave': (payload: { readonly channel: string }) => void;
  /** Report my open-world position (rate limited server-side). */
  'world:move': (payload: WorldMovePayload) => void;
}

export type RealtimeAck = { readonly ok: true } | { readonly ok: false; readonly error: string };
