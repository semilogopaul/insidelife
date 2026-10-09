import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/configuration.js';
import type { CharacterDirectory } from '../characters/character-directory.service.js';
import type { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { SessionRevocationService } from './session-revocation.service.js';

function setup(set: (...args: unknown[]) => Promise<unknown>) {
  const values = new Map<string, string>();
  const redis = {
    set: vi.fn(async (key: string, value: string, ...rest: unknown[]) => {
      await set(key, value, ...rest);
      values.set(key, value);
      return 'OK';
    }),
    get: async (key: string) => values.get(key) ?? null,
  } as unknown as Redis;
  const directory = { findLivingByUser: async () => ({ id: 'char-1' }) } as unknown as CharacterDirectory;
  const bus = { disconnectCharacter: vi.fn() };
  const settings: Partial<AppConfig> = {
    auth: { accessSecret: 's', accessTtlSeconds: 900, refreshTtlDays: 30, cookieSecure: false, requireEmailVerification: false },
    admin: { mfaKey: '', accessTtlSeconds: 600, sessionMaxHours: 12, sessionIdleMinutes: 120 },
  };
  const config = { get: (key: keyof AppConfig) => settings[key] } as unknown as ConfigService<AppConfig, true>;
  const service = new SessionRevocationService(redis, directory, bus as unknown as RealtimeBus, config);
  return { service, redis, bus };
}

describe('SessionRevocationService.cutOff', () => {
  it('retries a failed cut-off write, then refuses tokens issued before it', async () => {
    let failures = 2;
    const { service, redis, bus } = setup(async () => {
      if (failures-- > 0) throw new Error('redis busy');
    });
    expect(await service.cutOff('u1', 1_000)).toBe(true);
    expect(redis.set).toHaveBeenCalledTimes(3);
    expect(bus.disconnectCharacter).toHaveBeenCalledWith('char-1');
    expect(await service.isCutOff('u1', 999)).toBe(true);
    expect(await service.isCutOff('u1', 1_000)).toBe(false);
  });

  it('never throws (the suspension already committed) and still closes the sockets when Redis is down', async () => {
    const { service, bus } = setup(async () => {
      throw new Error('redis down');
    });
    expect(await service.cutOff('u1')).toBe(false);
    expect(bus.disconnectCharacter).toHaveBeenCalledWith('char-1');
  });
});
