import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  REALTIME_NAMESPACE,
  districtAt,
  isVehicleModel,
  interestCell,
  interestNeighbourhood,
  type ClientToServerEvents,
  type DistrictId,
  type PresencePlayerDto,
  type WealthClass,
  type RealtimeAck,
  type ServerToClientEvents,
  type WorldMovePayload,
  type WorldPlayerPositionDto,
  type WorldVehicleLook,
} from '@insidelife/shared';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import { deferred } from '../../common/utils/deferred.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import { PresenceService } from '../presence/presence.service.js';
import { RealtimeBus, characterRoom } from '../realtime-bus/realtime-bus.service.js';
import { SocialGuard } from '../social/social-guard.service.js';
import { ChatService } from './chat.service.js';
import { ShardsService } from './shards.service.js';
import { deliverSpeech } from './speech-delivery.js';
import { SpeechService } from './speech.service.js';
import { WealthClassService } from '../social/wealth-class.service.js';

type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface SocketData {
  characterId: string;
  handle: string;
  lastMoveAt: number;
  /** District room (district-wide events such as street parties). */
  districtRoom: string | null;
  /** Interest cell the player stands in (positions are published here; the 3×3 block around it is joined). */
  cell: string | null;
  cellRooms: ReadonlySet<string>;
  /** Lagos instance (see ShardsService): positions, arrivals and Lagos chat are scoped to it. */
  shard: string;
  /** Resolves once the handshake is authenticated; handlers wait on it so early events aren't dropped. */
  ready: Promise<boolean>;
}

/** Positions are relayed in batches at this rate. */
const POSITION_TICK_MS = 250;
/** Clients may report at most this often. */
const MIN_MOVE_INTERVAL_MS = 150;

const districtRoom = (districtId: string): string => `district:${districtId}`;
/** Everyone in one Lagos instance (arrivals, departures, Lagos chat). */
const shardRoom = (shard: string): string => `shard:${shard}`;
/** Players in the arrival snapshot. */
const PRESENCE_SAMPLE = 80;
/** The online count is pushed on this beat (not on every connect: that's O(n²) at scale). */
const ONLINE_COUNT_MS = 20_000;
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** A string field of a client payload ('' when missing or not a string: payloads are never trusted). */
function textField(payload: unknown, key: string): string {
  if (typeof payload !== 'object' || payload === null) return '';
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/** The client's ack callback, or a no-op when it didn't pass one (calling a missing ack would throw). */
function replyTo(ack: unknown): (result: RealtimeAck) => void {
  return typeof ack === 'function' ? (result) => (ack as (result: RealtimeAck) => void)(result) : () => undefined;
}

/** A driving player's car look, if it's a known model and a plain hex colour (cosmetic; anything else is dropped). */
function vehicleLook(payload: WorldMovePayload): WorldVehicleLook | undefined {
  const vehicle = payload.vehicle;
  if (payload.mode !== 'car' || !vehicle || typeof vehicle.model !== 'string' || typeof vehicle.color !== 'string') return undefined;
  return isVehicleModel(vehicle.model) && HEX_COLOUR.test(vehicle.color) ? { model: vehicle.model, color: vehicle.color } : undefined;
}

/**
 * Realtime gateway: presence, chat, speech bubbles and open-world position relay. Positions are visual only; the API
 * validates anything that matters (entering buildings, fuel). Rooms: `character:<id>` for private pushes,
 * `<instance>|cell:<x>:<z>` for interest-managed position batches and street speech (you hear the 3×3 cells around
 * you), `district:<id>` for district-wide events, chat channels by name.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE, cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() private server: Server<ClientToServerEvents, ServerToClientEvents>;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly pendingPositions = new Map<string, Map<string, WorldPlayerPositionDto>>();
  private flushTimer: NodeJS.Timeout | null = null;
  private countTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly auth: JwtAuthGuard,
    private readonly directory: CharacterDirectory,
    private readonly presence: PresenceService,
    private readonly chat: ChatService,
    private readonly bus: RealtimeBus,
    private readonly metrics: MetricsService,
    private readonly shards: ShardsService,
    private readonly social: SocialGuard,
    private readonly speech: SpeechService,
    private readonly wealth: WealthClassService,
  ) {}

  afterInit(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.bus.attach(server);
    this.flushTimer = setInterval(() => this.flushPositions(), POSITION_TICK_MS);
    this.flushTimer.unref();
    // Each node tells its own sockets (with the Redis adapter a plain emit would repeat once per node).
    this.countTimer = setInterval(() => void this.presence.onlineCount().then((count) => this.server.local.emit('world:online-count', { count })), ONLINE_COUNT_MS);
    this.countTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.countTimer) clearInterval(this.countTimer);
  }

  async handleConnection(socket: RealtimeSocket): Promise<void> {
    const ready = deferred<boolean>();
    socket.data = {
      characterId: '',
      handle: '',
      lastMoveAt: 0,
      districtRoom: null,
      cell: null,
      cellRooms: new Set(),
      shard: '',
      ready: ready.promise,
    };
    // Register handlers before any await so events sent right after connecting are queued, not lost.
    // Payloads and acks come from the client as-is: handlers read them defensively and never throw out of here.
    socket.on('chat:send', (body: unknown, ack: unknown) => void this.whenReady(socket, () => this.onChatSend(socket, textField(body, 'channel'), textField(body, 'body'), replyTo(ack))));
    socket.on('chat:join', (body: unknown, ack: unknown) => void this.whenReady(socket, () => this.onChatJoin(socket, textField(body, 'channel'), replyTo(ack))));
    socket.on('chat:leave', (body: unknown) => {
      const channel = textField(body, 'channel');
      if (channel) void socket.leave(channel);
    });
    socket.on('chat:say', (body: unknown, ack: unknown) => void this.whenReady(socket, () => this.onSay(socket, body, replyTo(ack))));
    socket.on('world:move', (body: unknown) => void this.whenReady(socket, async () => this.onMove(socket, body as WorldMovePayload)));

    try {
      const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;
      if (!token) throw new DomainException('UNAUTHENTICATED', 'Missing token');
      // Same rules as the HTTP guard, plus a confirmed email: unverified accounts can't enter the world.
      const user = await this.auth.verifyPlayer(token);
      const character = await this.directory.findLivingByUser(user.userId);
      if (!character) throw new DomainException('NO_CHARACTER', 'No character');

      socket.data.characterId = character.id;
      socket.data.handle = character.handle;
      const shard = await this.shards.assign(character.id, await this.social.friendIds(character.id));
      socket.data.shard = shard;
      await socket.join([characterRoom(character.id), shardRoom(shard)]);
      const player = this.toPresence(character, await this.wealth.classOf(character.id));
      await this.presence.markOnline(player);
      this.metrics.onlinePlayers.inc();
      ready.resolve(true);

      // Only your instance hears you arrive; you get a sample of who's in it.
      socket.emit('presence:snapshot', await this.presence.players(await this.shards.sample(shard, PRESENCE_SAMPLE)));
      socket.to(shardRoom(shard)).emit('presence:joined', player);
      socket.emit('world:instance', { id: shard, players: await this.shards.size(shard) });
      socket.emit('world:online-count', { count: await this.presence.onlineCount() });
    } catch (error) {
      ready.resolve(false);
      this.logger.debug(`Rejected socket: ${error instanceof Error ? error.message : 'unknown'}`);
      socket.disconnect(true);
    }
  }

  private async whenReady(socket: RealtimeSocket, handler: () => Promise<void>): Promise<void> {
    try {
      if (await socket.data.ready) await handler();
    } catch (error) {
      // A malformed payload must never become an unhandled rejection (that would take the node down).
      this.logger.debug(`Realtime event dropped: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  async handleDisconnect(socket: RealtimeSocket): Promise<void> {
    const characterId = socket.data?.characterId;
    if (!characterId) return;
    this.metrics.onlinePlayers.dec();
    const remaining = await this.server.in(characterRoom(characterId)).fetchSockets();
    if (remaining.length > 0) return;
    await this.presence.markOffline(characterId);
    await this.shards.leave(characterId);
    if (socket.data.shard) this.server.to(shardRoom(socket.data.shard)).emit('presence:left', { characterId });
  }

  private async onChatSend(socket: RealtimeSocket, channel: string, body: string, ack: (result: RealtimeAck) => void): Promise<void> {
    try {
      const sender = await this.directory.findById(socket.data.characterId);
      if (!sender) throw new DomainException('NO_CHARACTER', 'No character');
      const message = await this.chat.send(sender, channel, body, socket.data.shard || null);
      if (channel.startsWith('dm:')) {
        for (const participant of channel.split(':').slice(1)) this.server.to(characterRoom(participant)).emit('chat:message', message);
      } else {
        // Lagos chat goes to your instance only.
        this.server.to(channel === 'global' ? shardRoom(socket.data.shard) : channel).emit('chat:message', message);
      }
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, error: error instanceof DomainException ? error.message : 'Message not sent' });
    }
  }

  private async onChatJoin(socket: RealtimeSocket, channel: string, ack: (result: RealtimeAck) => void): Promise<void> {
    const character = await this.directory.findById(socket.data.characterId);
    if (!character || !this.chat.canAccess(character, channel)) {
      ack({ ok: false, error: 'You’re not in that chat' });
      return;
    }
    // Lagos chat: you're already in your instance's room.
    if (!channel.startsWith('dm:') && channel !== 'global') await socket.join(channel);
    ack({ ok: true });
  }

  /** Say something out loud: a speech bubble for the people around you (`SpeechService` decides who). */
  private async onSay(socket: RealtimeSocket, payload: unknown, ack: (result: RealtimeAck) => void): Promise<void> {
    try {
      const spoken = await this.speech.say(
        {
          characterId: socket.data.characterId,
          cellRoom: socket.data.cell,
          districtId: socket.data.districtRoom ? (socket.data.districtRoom.slice('district:'.length) as DistrictId) : null,
        },
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).text : undefined,
      );
      deliverSpeech(this.server, spoken);
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, error: error instanceof DomainException ? error.message : 'Couldn’t say that. Try again' });
    }
  }

  private onMove(socket: RealtimeSocket, payload: WorldMovePayload): void {
    const now = Date.now();
    if (typeof payload !== 'object' || payload === null) return;
    if (now - socket.data.lastMoveAt < MIN_MOVE_INTERVAL_MS) return;
    if (![payload.x, payload.z, payload.heading, payload.speed].every(Number.isFinite)) return;
    if (payload.mode !== 'walk' && payload.mode !== 'car') return;
    socket.data.lastMoveAt = now;

    const point = { x: payload.x, z: payload.z };
    const district = districtRoom(districtAt(point));
    if (socket.data.districtRoom !== district) {
      if (socket.data.districtRoom) void socket.leave(socket.data.districtRoom);
      void socket.join(district);
      socket.data.districtRoom = district;
    }
    const cell = `${socket.data.shard}|${interestCell(point)}`;
    if (socket.data.cell !== cell) this.moveInterest(socket, cell, new Set(interestNeighbourhood(point).map((room) => `${socket.data.shard}|${room}`)));

    let batch = this.pendingPositions.get(cell);
    if (!batch) {
      batch = new Map();
      this.pendingPositions.set(cell, batch);
    }
    const vehicle = vehicleLook(payload);
    batch.set(socket.data.characterId, {
      characterId: socket.data.characterId,
      handle: socket.data.handle,
      x: payload.x,
      z: payload.z,
      heading: payload.heading,
      mode: payload.mode,
      speed: Math.min(60, Math.max(0, payload.speed)),
      ...(vehicle ? { vehicle } : {}),
      t: now,
    });
  }

  /** Listen to the cells around the player's new cell (leave the ones now out of range). */
  private moveInterest(socket: RealtimeSocket, cell: string, wanted: ReadonlySet<string>): void {
    for (const room of socket.data.cellRooms) if (!wanted.has(room)) void socket.leave(room);
    for (const room of wanted) if (!socket.data.cellRooms.has(room)) void socket.join(room);
    socket.data.cell = cell;
    socket.data.cellRooms = wanted;
  }

  private flushPositions(): void {
    for (const [room, batch] of this.pendingPositions) {
      if (batch.size > 0) this.server.to(room).emit('world:players', [...batch.values()]);
    }
    this.pendingPositions.clear();
  }

  private toPresence(character: CharacterEntity, wealthClass: WealthClass): PresencePlayerDto {
    return {
      characterId: character.id,
      handle: character.handle,
      firstName: character.firstName,
      gender: character.gender,
      appearance: character.appearance,
      outfit: character.outfit,
      locationId: character.locationId,
      activity: character.activity?.actionId ?? null,
      status: character.status,
      wealthClass,
    };
  }
}
