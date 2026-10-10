import { Injectable } from '@nestjs/common';
import type { PlayState, PlayStateDto } from '@insidelife/shared';
import { awayStamp, isPlayerPresent, presentUntil } from '../simulation/player-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';

/**
 * The client's "I'm at the controls" / "I've left" reports. Runs inside a settled `CharacterSession`, so the time up
 * to now keeps the presence it had and the new state only applies from now on: settling in any chunks agrees.
 */
@Injectable()
export class PlayStateService {
  update(ctx: SimulationContext, state: PlayState, nowMs: number = Date.now()): PlayStateDto {
    const character = ctx.character;
    const wasPresent = isPlayerPresent(ctx);
    character.lastActiveAt = state === 'playing' ? new Date(nowMs) : awayStamp(character.lastActiveAt, nowMs);
    return { state, resumed: state === 'playing' && !wasPresent, presentUntil: presentUntil(character, ctx.world.clock) };
  }
}
