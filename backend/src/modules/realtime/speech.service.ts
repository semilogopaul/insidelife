import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { isStreetLocation, streetLocationId, type ChatSaidDto, type DistrictId } from '@insidelife/shared';
import { ForbiddenActionException, GameRuleException, RateLimitedException } from '../../common/exceptions/domain.exception.js';
import { REDIS } from '../../common/redis/redis.module.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { SocialGuard } from '../social/social-guard.service.js';
import { WealthClassService } from '../social/wealth-class.service.js';
import { UsersService } from '../users/users.service.js';
import { SPEECH_RATE, SPEECH_SLOT_SCRIPT, checkSpeech } from './speech.rules.js';

/** Who's talking, as the gateway knows them (the character is re-read from the database for every line). */
export interface Speaker {
  readonly characterId: string;
  /** The speaker's interest cell room (`<instance>|cell:x:z`), once they've reported a street position. */
  readonly cellRoom: string | null;
  /** The district they were last seen walking or driving in. */
  readonly districtId: DistrictId | null;
}

/**
 * Who hears a line. `street`: everyone listening to the speaker's cell (their cell and its neighbours, same Lagos
 * instance) except anyone in a block with them. `place`: these characters (everyone present, the speaker included,
 * blocks removed). The speaker's own sockets always hear it.
 */
export type SpeechAudience =
  | { readonly kind: 'street'; readonly cellRoom: string | null; readonly blockedIds: readonly string[] }
  | { readonly kind: 'place'; readonly characterIds: readonly string[] };

export interface SpokenLine {
  readonly line: ChatSaidDto;
  readonly audience: SpeechAudience;
}

/** People in one place who hear a line (presence is capped per place; Lagos instances hold ~200). */
const PLACE_AUDIENCE = 200;
const SLOT_KEY = (characterId: string): string => `speech:slot:${characterId}`;

/**
 * Speech bubbles: a player says something out loud and the people around them see it over their head for a few
 * seconds. Nothing is stored: venue chat (Gist → Here) stays the room's written history, and since it doesn't apply
 * blocks, spoken lines are not copied into it. Rules: `speech.rules.ts`; delivery: `speech-delivery.ts`.
 */
@Injectable()
export class SpeechService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly directory: CharacterDirectory,
    private readonly users: UsersService,
    private readonly presence: PresenceService,
    private readonly social: SocialGuard,
    private readonly wealth: WealthClassService,
  ) {}

  async say(speaker: Speaker, raw: unknown): Promise<SpokenLine> {
    const check = checkSpeech(raw);
    if (!check.ok) throw new GameRuleException(check.code, check.message);
    await this.takeSlot(speaker.characterId);

    // Suspended and deleted accounts lose their sockets at once; this covers the moment in between.
    const character = await this.directory.findById(speaker.characterId);
    const user = character?.alive && !character.hiddenAt ? await this.users.findById(character.userId) : null;
    if (!character || !user || user.suspendedAt || user.deletedAt || user.purgedAt) throw new ForbiddenActionException('You can’t talk right now');

    const outside = character.travel !== null || isStreetLocation(character.locationId);
    const line: ChatSaidDto = {
      id: randomUUID(),
      characterId: character.id,
      handle: character.handle,
      firstName: character.firstName,
      wealthClass: await this.wealth.classOf(character.id),
      text: check.text,
      at: Date.now(),
      scope: outside ? 'street' : 'place',
      locationId: outside && !isStreetLocation(character.locationId) && speaker.districtId ? streetLocationId(speaker.districtId) : character.locationId,
    };
    const blocked = await this.social.blockedIds(character.id);
    if (outside) return { line, audience: { kind: 'street', cellRoom: speaker.cellRoom, blockedIds: [...blocked] } };

    const present = await this.presence.playersAt(character.locationId, PLACE_AUDIENCE);
    const listeners = present
      .filter((player) => player.locationId === character.locationId && player.characterId !== character.id && !blocked.has(player.characterId))
      .map((player) => player.characterId);
    return { line, audience: { kind: 'place', characterIds: [character.id, ...listeners] } };
  }

  /** One rate-limit slot (atomic in Redis, so it holds across tabs and gateway nodes). */
  private async takeSlot(characterId: string): Promise<void> {
    const wait = Number(
      await this.redis.eval(SPEECH_SLOT_SCRIPT, 1, SLOT_KEY(characterId), Date.now(), SPEECH_RATE.intervalMs, SPEECH_RATE.intervalMs * (SPEECH_RATE.burst - 1)),
    );
    if (wait > 0) throw new RateLimitedException(`Breathe small — you can talk again in ${Math.max(1, Math.ceil(wait / 1000))} s`);
  }
}
