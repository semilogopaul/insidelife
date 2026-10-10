import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PresencePlayerDto } from '@insidelife/shared';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import type { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { PresenceService } from '../presence/presence.service.js';
import type { SocialGuard } from '../social/social-guard.service.js';
import type { UserEntity } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import { WealthClassService } from '../social/wealth-class.service.js';
import { SpeechService, type Speaker } from './speech.service.js';
import { nextSpeechSlot } from './speech.rules.js';

const ADA = 'ada';
const CELL = 'lagos-1|cell:3:4';

interface World {
  character: Partial<CharacterEntity> | null;
  user: Partial<UserEntity> | null;
  blocked: Set<string>;
  present: PresencePlayerDto[];
}

const presence = (characterId: string, locationId: string): PresencePlayerDto =>
  ({ characterId, handle: characterId, firstName: characterId, locationId }) as PresencePlayerDto;

/** Redis with only the speech slot script: runs the same arithmetic as the Lua copy. */
function slotRedis(): Redis {
  const slots = new Map<string, number>();
  return {
    eval: async (_script: string, _keys: number, key: string, now: number) => {
      const slot = nextSpeechSlot(slots.get(key) ?? null, now);
      if (!slot.allowed) return slot.retryInMs;
      slots.set(key, slot.tat);
      return 0;
    },
  } as unknown as Redis;
}

function service(world: World): SpeechService {
  const directory = { findById: async () => world.character } as unknown as CharacterDirectory;
  const users = { findById: async () => world.user } as unknown as UsersService;
  const presenceService = { playersAt: async () => world.present } as unknown as PresenceService;
  const social = { blockedIds: async () => world.blocked } as unknown as SocialGuard;
  return new SpeechService(slotRedis(), directory, users, presenceService, social, { classOf: async () => 'lapo' } as unknown as WealthClassService);
}

const speaker: Speaker = { characterId: ADA, cellRoom: CELL, districtId: 'yaba' };

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainException) return error.errorCode;
    throw error;
  }
  return 'OK';
}

describe('SpeechService', () => {
  let world: World;
  beforeEach(() => {
    world = {
      character: { id: ADA, userId: 'u-ada', handle: 'ada_b', firstName: 'Ada', alive: true, hiddenAt: null, locationId: 'street:yaba', travel: null },
      user: { id: 'u-ada', suspendedAt: null, deletedAt: null, purgedAt: null },
      blocked: new Set(),
      present: [],
    };
  });

  it('on the street: the line goes to the speaker’s cell room, blocks listed for exclusion', async () => {
    world.blocked = new Set(['tobi']);
    const spoken = await service(world).say(speaker, ' How far? ');
    expect(spoken.line).toMatchObject({ characterId: ADA, handle: 'ada_b', firstName: 'Ada', text: 'How far?', scope: 'street', locationId: 'street:yaba' });
    expect(spoken.line.id).toMatch(/[0-9a-f-]{36}/);
    expect(spoken.audience).toEqual({ kind: 'street', cellRoom: CELL, blockedIds: ['tobi'] });
  });

  it('riding through the city counts as the street (the district comes from the last position)', async () => {
    world.character = { ...world.character, locationId: 'unilag', travel: { fromLocationId: 'unilag', toLocationId: 'luth', mode: 'danfo', departAt: 0, arriveAt: 10, fare: 0 } };
    const spoken = await service(world).say(speaker, 'Owa o!');
    expect(spoken.line).toMatchObject({ scope: 'street', locationId: 'street:yaba' });
  });

  it('inside a place: everyone present hears it (any Lagos instance), minus blocks, plus the speaker', async () => {
    world.character = { ...world.character, locationId: 'vi-lounge' };
    world.present = [presence(ADA, 'vi-lounge'), presence('kemi', 'vi-lounge'), presence('tobi', 'vi-lounge'), presence('stale', 'somewhere-else')];
    world.blocked = new Set(['tobi']);
    const spoken = await service(world).say(speaker, 'Wetin you dey drink?');
    expect(spoken.line).toMatchObject({ scope: 'place', locationId: 'vi-lounge' });
    expect(spoken.audience).toEqual({ kind: 'place', characterIds: [ADA, 'kemi'] });
  });

  it('works in homes too (the whole home hears it)', async () => {
    world.character = { ...world.character, locationId: 'home:host' };
    world.present = [presence('host', 'home:host')];
    const spoken = await service(world).say(speaker, 'Thanks for having me');
    expect(spoken.audience).toEqual({ kind: 'place', characterIds: [ADA, 'host'] });
  });

  it('refuses suspended and deleted accounts and hidden or dead characters', async () => {
    world.user = { ...world.user, suspendedAt: new Date() };
    expect(await refusal(service(world).say(speaker, 'hi'))).toBe('FORBIDDEN');
    world.user = { ...world.user, suspendedAt: null, deletedAt: new Date() };
    expect(await refusal(service(world).say(speaker, 'hi'))).toBe('FORBIDDEN');
    world.user = { ...world.user, deletedAt: null };
    world.character = { ...world.character, hiddenAt: new Date() };
    expect(await refusal(service(world).say(speaker, 'hi'))).toBe('FORBIDDEN');
    world.character = { ...world.character, hiddenAt: null, alive: false };
    expect(await refusal(service(world).say(speaker, 'hi'))).toBe('FORBIDDEN');
    world.character = null;
    expect(await refusal(service(world).say(speaker, 'hi'))).toBe('FORBIDDEN');
  });

  it('refuses links and numbers before using up a slot', async () => {
    const speech = service(world);
    expect(await refusal(speech.say(speaker, 'www.scam.ng'))).toBe('SPEECH_LINK');
    expect(await refusal(speech.say(speaker, '08031234567'))).toBe('SPEECH_NUMBER');
    for (let i = 0; i < 5; i++) expect(await refusal(speech.say(speaker, `line ${i}`))).toBe('OK');
  });

  it('rate limits: five lines back to back, the sixth waits', async () => {
    const speech = service(world);
    for (let i = 0; i < 5; i++) await speech.say(speaker, `line ${i}`);
    await expect(speech.say(speaker, 'one more')).rejects.toMatchObject({ errorCode: 'RATE_LIMITED', message: expect.stringMatching(/talk again in 2 s/) });
  });
});
