import type { WealthClassService } from '../social/wealth-class.service.js';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { describe, expect, it, vi } from 'vitest';
import { decodeWorldBatch, type ChatSaidDto, type RealtimeAck } from '@insidelife/shared';
import { RateLimitedException } from '../../common/exceptions/domain.exception.js';
import type { OverloadMonitor } from '../../common/overload/overload-monitor.service.js';
import type { MetricsService } from '../../metrics/metrics.service.js';
import type { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { CharacterDirectory } from '../characters/character-directory.service.js';
import type { PresenceService } from '../presence/presence.service.js';
import type { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import type { SocialGuard } from '../social/social-guard.service.js';
import type { ChatService } from './chat.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import type { ShardsService } from './shards.service.js';
import type { SpeechService, SpokenLine } from './speech.service.js';

type Handler = (...args: unknown[]) => void;

const line: ChatSaidDto = { id: 'l1', characterId: 'ada', handle: 'ada_b', firstName: 'Ada', text: 'How far?', at: 1, scope: 'street', locationId: 'street:yaba' };

/** A connected socket for the gateway, with its event handlers captured, and a server that records emits. */
interface ConnectOptions {
  readonly maxOnline?: number;
  readonly online?: number;
  readonly alreadyOnline?: boolean;
  readonly characterId?: string;
  readonly overloaded?: boolean;
}

async function connect(say: SpeechService['say'], options: ConnectOptions = {}) {
  const handlers = new Map<string, Handler>();
  const emitted: Array<{ rooms: unknown; except: unknown; event: string; payload: unknown }> = [];
  const broadcast = (rooms: unknown, except: unknown = []) => ({
    except: (more: unknown) => broadcast(rooms, more),
    emit: (event: string, payload: unknown) => {
      emitted.push({ rooms, except, event, payload });
      return true;
    },
  });
  const server = { to: (rooms: unknown) => broadcast(rooms), local: { emit: vi.fn() }, in: () => ({ fetchSockets: async () => [] }) };
  const socket = {
    handshake: { auth: { token: 'token' } },
    data: undefined as unknown,
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    emit: vi.fn(),
    to: () => ({ emit: vi.fn() }),
    disconnect: vi.fn(),
  };
  const speech = { say: vi.fn(say) } as unknown as SpeechService;
  const gateway = new RealtimeGateway(
    { verifyPlayer: async () => ({ userId: 'u-ada' }) } as unknown as JwtAuthGuard,
    { findLivingByUser: async () => ({ id: options.characterId ?? 'ada', handle: 'ada_b', firstName: 'Ada', locationId: 'street:yaba', activity: null, status: 0 }) } as unknown as CharacterDirectory,
    { markOnline: vi.fn(async () => undefined), players: async () => [], onlineCount: async () => options.online ?? 1, isOnline: async () => options.alreadyOnline ?? false } as unknown as PresenceService,
    {} as ChatService,
    { attach: vi.fn() } as unknown as RealtimeBus,
    { onlinePlayers: { inc: vi.fn(), dec: vi.fn() } } as unknown as MetricsService,
    { assign: async () => 'lagos-1', sample: async () => [], size: async () => 1 } as unknown as ShardsService,
    { friendIds: async () => [] } as unknown as SocialGuard,
    speech,
    { classOf: async () => 'lapo' } as unknown as WealthClassService,
    { overloaded: options.overloaded ?? false } as OverloadMonitor,
    { get: () => ({ maxOnlinePlayers: options.maxOnline ?? 0 }) } as unknown as ConfigService<AppConfig, true>,
  );
  (gateway as unknown as { server: unknown }).server = server;
  await gateway.handleConnection(socket as never);
  const fire = (event: string, ...args: unknown[]) => handlers.get(event)?.(...args);
  return { fire, emitted, speech, socket, gateway };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RealtimeGateway chat:say', () => {
  it('passes the text and where the speaker stands, delivers the line and acks', async () => {
    const spoken: SpokenLine = { line, audience: { kind: 'street', cellRoom: 'lagos-1|cell:3:4', blockedIds: ['tobi'] } };
    const { fire, emitted, speech } = await connect(async () => spoken);
    fire('world:move', { x: 10, z: 12, heading: 0, mode: 'walk', speed: 0 });
    await settle();
    const ack = vi.fn<(result: RealtimeAck) => void>();
    fire('chat:say', { text: 'How far?' }, ack);
    await settle();
    expect(speech.say).toHaveBeenCalledWith({ characterId: 'ada', cellRoom: expect.stringMatching(/^lagos-1\|cell:/), districtId: expect.any(String) }, 'How far?');
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(emitted).toEqual([{ rooms: ['lagos-1|cell:3:4', 'character:ada'], except: ['character:tobi'], event: 'chat:said', payload: line }]);
  });

  it('acks the refusal reason (rate limit, rules) and emits nothing', async () => {
    const { fire, emitted } = await connect(async () => {
      throw new RateLimitedException('Breathe small — you can talk again in 2 s');
    });
    const ack = vi.fn();
    fire('chat:say', { text: 'again' }, ack);
    await settle();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Breathe small — you can talk again in 2 s' });
    expect(emitted).toEqual([]);
  });

  it('survives malformed events: no payload, no ack, junk', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { fire, speech } = await connect(async () => ({ line, audience: { kind: 'place', characterIds: ['ada'] } }));
      fire('chat:say');
      fire('chat:say', null, 'not a function');
      fire('chat:send', null);
      fire('chat:join', 42);
      fire('chat:leave', undefined);
      fire('world:move', null);
      await settle();
      await settle();
      expect(unhandled).not.toHaveBeenCalled();
      expect(speech.say).toHaveBeenCalledWith(expect.anything(), undefined);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('RealtimeGateway players-online cap', () => {
  const idle = async () => ({ line, audience: { kind: 'street' as const, cellRoom: 'x', blockedIds: [] } });

  it('turns a newcomer away with world:full and disconnects when the cap is reached', async () => {
    const { socket } = await connect(idle, { maxOnline: 100, online: 100 });
    expect(socket.emit).toHaveBeenCalledWith('world:full', { retryAfterSeconds: expect.any(Number) });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.emit).not.toHaveBeenCalledWith('presence:snapshot', expect.anything());
    expect((socket.data as { characterId: string }).characterId).toBe('');
  });

  it('lets a reconnect (already online) back in even at the cap', async () => {
    const { socket } = await connect(idle, { maxOnline: 100, online: 100, alreadyOnline: true });
    expect(socket.emit).not.toHaveBeenCalledWith('world:full', expect.anything());
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('presence:snapshot', []);
  });

  it('turns everyone away while the node is overloaded, reconnects too, without checking the token', async () => {
    const { socket, gateway } = await connect(idle, { overloaded: true, alreadyOnline: true });
    expect(socket.emit).toHaveBeenCalledWith('world:full', { retryAfterSeconds: expect.any(Number) });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.emit).not.toHaveBeenCalledWith('presence:snapshot', expect.anything());
    expect((socket.data as { characterId: string }).characterId).toBe('');
    expect(gateway).toBeDefined();
  });

  it('admits newcomers below the cap, and everyone when the cap is 0 (unlimited)', async () => {
    const below = await connect(idle, { maxOnline: 100, online: 99 });
    expect(below.socket.disconnect).not.toHaveBeenCalled();
    const unlimited = await connect(idle, { maxOnline: 0, online: 1_000_000 });
    expect(unlimited.socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('RealtimeGateway position batches', () => {
  const idle = async () => ({ line, audience: { kind: 'street' as const, cellRoom: 'x', blockedIds: [] } });
  const id = '3f2b8c1e-5d4a-4e7b-9a60-1c2d3e4f5a6b';

  it('relays compact batches: handle on the first position, then only now and then', async () => {
    const { fire, emitted, gateway, socket } = await connect(idle, { characterId: id });
    const flush = () => (gateway as unknown as { flushPositions(): void }).flushPositions();
    const batches = () => emitted.filter((e) => e.event === 'world:players').map((e) => decodeWorldBatch(e.payload as never));

    fire('world:move', { x: 10, z: 12, heading: 0.5, mode: 'walk', speed: 1.4 });
    await settle();
    flush();
    (socket.data as { lastMoveAt: number }).lastMoveAt = 0;
    fire('world:move', { x: 11, z: 12, heading: 0.5, mode: 'walk', speed: 1.4 });
    await settle();
    flush();

    const [first, second] = batches();
    expect(first).toHaveLength(1);
    expect(first![0]).toMatchObject({ characterId: id, handle: 'ada_b', mode: 'walk' });
    expect(second![0]).toMatchObject({ characterId: id, handle: '' });
    expect(second![0]!.x).toBeCloseTo(11, 1);
  });
});
