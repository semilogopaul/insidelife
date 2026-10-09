import type { Appearance, Gender, Outfit } from '../catalog/appearance.js';
import type { NightOutItemId, VenueMomentEffect, VenueMomentKind } from '../catalog/social.js';
import type { NotificationDto } from './core.js';
import type { SocialMomentDto } from './family.js';
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

/**
 * Plain text, a voice note or a photo. Voice notes and photos are DM-only. `system` is a venue-chat line the server
 * writes for something a player paid for (a DJ shoutout, a bottle sent); `sender` is that player.
 */
export const CHAT_MESSAGE_KINDS = ['text', 'voice', 'image', 'system'] as const;
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number];
export type ChatMediaKind = Extract<ChatMessageKind, 'voice' | 'image'>;

/** Longest voice note (seconds). */
export const CHAT_VOICE_MAX_SECONDS = 90;
/** Upload caps (bytes): ~90 s of 32 kbps Opus/AAC with headroom; a phone photo after the client's resize. */
export const CHAT_VOICE_MAX_BYTES = 600_000;
export const CHAT_IMAGE_MAX_BYTES = 3_000_000;
/** Photos are stored with their longest edge at most this many pixels. */
export const CHAT_IMAGE_MAX_EDGE = 1600;
/** Text messages a non-friend may send before you accept their message request. */
export const CHAT_REQUEST_MESSAGE_LIMIT = 3;
/** Chat (and its media) is deleted after this many days. */
export const CHAT_RETENTION_DAYS = 5;
/** Recorder formats the server accepts for voice notes (browser MediaRecorder output). */
export const CHAT_VOICE_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4'] as const;
export type ChatVoiceType = (typeof CHAT_VOICE_TYPES)[number];

/** Multipart field carrying the voice note or photo (`POST /chat/dms/:channel/media`). */
export const CHAT_UPLOAD_FIELD = 'file';

export interface UploadChatMediaFields {
  readonly kind: ChatMediaKind;
}

export interface ChatMediaDto {
  /** Signed, short-lived link (only the people in the chat receive it). */
  readonly url: string;
  readonly contentType: string;
  /** Voice notes. */
  readonly durationMs: number | null;
  /** Photos. */
  readonly width: number | null;
  readonly height: number | null;
}

export interface ChatMessageDto {
  readonly id: string;
  /** `global`, `venue:<venueId>` or `dm:<characterIdA>:<characterIdB>` (ids sorted). */
  readonly channel: string;
  readonly sender: { readonly characterId: string; readonly handle: string; readonly firstName: string; readonly status: number };
  readonly kind: ChatMessageKind;
  /** Empty for voice notes and photos. */
  readonly body: string;
  readonly media: ChatMediaDto | null;
  readonly createdAt: string;
}

/**
 * Message requests: a non-friend's first messages land in your Requests, not your inbox. `incoming` = they wrote to
 * you and you haven't accepted; `outgoing` = you wrote to them and they haven't accepted (text only, a few messages).
 */
export type DmRequestState = 'none' | 'incoming' | 'outgoing';

/** One private conversation in the player's DM list (newest first). */
export interface DmThreadDto {
  /** `dm:<characterIdA>:<characterIdB>` (ids sorted). */
  readonly channel: string;
  readonly counterpart: { readonly characterId: string; readonly handle: string; readonly firstName: string; readonly lastName: string };
  readonly lastMessageAt: string;
  /** First 120 characters of the latest message (or "Voice note 0:12" / "Photo"). */
  readonly preview: string;
  /** True when the latest message came from me. */
  readonly lastFromMe: boolean;
  /** A message from them arrived after I last opened the thread. */
  readonly unread: boolean;
  readonly request: DmRequestState;
}

/** What I can do in a DM right now (opening a chat with someone new, or after a request changes). */
export interface DmStateDto {
  readonly channel: string;
  readonly request: DmRequestState;
  /** Voice notes and photos are allowed (friends, or the request was accepted). */
  readonly canSendMedia: boolean;
  /** Text messages left while my request is pending (`null` when not limited). */
  readonly requestMessagesLeft: number | null;
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

export interface VenueMomentPersonDto {
  readonly characterId: string;
  readonly handle: string;
  readonly firstName: string;
}

/**
 * A paid moment in a club or bar that everyone in the room sees (`venue:moment`): a bottle sent to someone, a DJ
 * shoutout, a birthday cake, a confetti cannon, the VIP section reserved… The banner and the 3D effect play from
 * `startsAt` for `durationMs` (server clock: compare with the synced `gameClock.serverNow()`). Shoutouts queue per
 * place, so only one is on screen at a time; everything else starts at once.
 */
export interface VenueMomentDto {
  readonly id: string;
  readonly venueId: string;
  readonly kind: VenueMomentKind;
  readonly from: VenueMomentPersonDto;
  /** Who it's for (bottles, a birthday for someone else); null when it's the buyer's own moment. */
  readonly to: VenueMomentPersonDto | null;
  /** "Champagne", "Odogwu shoutout", "Birthday package". */
  readonly label: string;
  readonly emoji: string;
  /** The catalog item (its tier): `champagne`, `shoutout-odogwu`, `vip-section`… */
  readonly tier: NightOutItemId;
  readonly effect: VenueMomentEffect;
  /** A shoutout's message (already cleaned by the server). */
  readonly message: string | null;
  readonly durationMs: number;
  /** Epoch ms on the server clock. */
  readonly startsAt: number;
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
  /** Someone hugged or kissed you (in the same place): show the moment. */
  'social:moment': (payload: SocialMomentDto) => void;
  'party:spray': (spray: SprayEventDto) => void;
  /** A paid moment in the club or bar you're in (bottle, shoutout, experience): show the banner and the effect. */
  'venue:moment': (moment: VenueMomentDto) => void;
  'world:online-count': (payload: { readonly count: number }) => void;
  /** Your Lagos instance (who you see on the streets and in Lagos chat): its id and how many are in it. */
  'world:instance': (payload: { readonly id: string; readonly players: number }) => void;
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
