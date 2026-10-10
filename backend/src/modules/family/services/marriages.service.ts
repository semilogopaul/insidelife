import { Injectable } from '@nestjs/common';
import { IsNull, Not, type EntityManager } from 'typeorm';
import type { WeddingTier } from '@insidelife/shared';
import type { RowProbe } from '../../simulation/row-presence.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { MarriageEntity, type MarriageStatus } from '../entities/marriage.entity.js';

const MARRIAGE_KEY = 'family:marriage';
/** Most characters have never married: the marriage reads are skipped when there's no row either side (see `RowProbe`). */
export const MARRIAGE_ROWS: RowProbe = { key: 'family:marriages', table: 'family_marriages', where: 'character_id = $1 OR spouse_character_id = $1' };

export type SpouseRef = { readonly personId: string } | { readonly characterId: string };

/** Marriage records. A player-to-player marriage is one row both players read. */
@Injectable()
export class MarriagesService {
  /** The character's active marriage (either side of a player couple). */
  active(ctx: SimulationContext): Promise<MarriageEntity | null> {
    return ctx.memo(MARRIAGE_KEY, async () => ((await ctx.mayHaveRows(MARRIAGE_ROWS)) ? MarriagesService.activeFor(ctx.manager, ctx.character.id) : null));
  }

  static activeFor(manager: EntityManager, characterId: string): Promise<MarriageEntity | null> {
    return manager.findOne(MarriageEntity, {
      where: [
        { characterId, status: 'active' },
        { spouseCharacterId: characterId, status: 'active' },
      ],
    });
  }

  /** Most recent marriage, active or not (widowed / divorced status). */
  async latest(ctx: SimulationContext): Promise<MarriageEntity | null> {
    const characterId = ctx.character.id;
    if (!(await ctx.mayHaveRows(MARRIAGE_ROWS))) return null;
    return ctx.manager.findOne(MarriageEntity, {
      where: [{ characterId }, { spouseCharacterId: characterId }],
      order: { marriedAt: 'DESC' },
    });
  }

  /** Player-to-player marriages involving this character (for reconciliation). */
  async playerMarriages(ctx: SimulationContext): Promise<MarriageEntity[]> {
    const characterId = ctx.character.id;
    if (!(await ctx.mayHaveRows(MARRIAGE_ROWS))) return [];
    return ctx.manager.find(MarriageEntity, {
      where: [
        { characterId, spouseCharacterId: Not(IsNull()) },
        { spouseCharacterId: characterId },
      ],
      order: { marriedAt: 'ASC' },
    });
  }

  async marry(ctx: SimulationContext, spouse: SpouseRef, details: { readonly tier: WeddingTier | null; readonly traditional: boolean }): Promise<MarriageEntity> {
    const marriage = await ctx.manager.save(
      MarriageEntity,
      ctx.manager.create(MarriageEntity, {
        characterId: ctx.character.id,
        spouseCharacterId: 'characterId' in spouse ? spouse.characterId : null,
        spousePersonId: 'personId' in spouse ? spouse.personId : null,
        status: 'active',
        marriedAt: ctx.time,
        endedAt: null,
        weddingTier: details.tier,
        traditional: details.traditional,
      }),
    );
    ctx.invalidate(MARRIAGE_KEY);
    return marriage;
  }

  async update(ctx: SimulationContext, marriage: MarriageEntity): Promise<void> {
    await ctx.manager.save(MarriageEntity, marriage);
    ctx.invalidate(MARRIAGE_KEY);
  }

  async end(ctx: SimulationContext, marriage: MarriageEntity, status: Exclude<MarriageStatus, 'active'>): Promise<void> {
    marriage.status = status;
    marriage.endedAt = ctx.time;
    await this.update(ctx, marriage);
  }
}
