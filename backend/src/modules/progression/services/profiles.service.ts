import { Injectable } from '@nestjs/common';
import { MAX_STATUS, PROGRESSION_CLOUT_CAP } from '@insidelife/shared';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { ProgressionProfileEntity } from '../entities/progression-profile.entity.js';
import { addCappedClout } from '../progression.rules.js';

type ProfilePatch = Partial<Pick<ProgressionProfileEntity, 'chapter' | 'legacyComplete' | 'clout' | 'jobKey' | 'earnedMark' | 'lastProbedDay'>>;

/** The per-character progression profile: chapter, permanent clout and observer bookkeeping. */
@Injectable()
export class ProfilesService {
  private readonly loaded = new WeakMap<SimulationContext, ProgressionProfileEntity | null>();

  /** Load without creating (used by the status hook on every settle). */
  async peek(ctx: SimulationContext): Promise<ProgressionProfileEntity | null> {
    if (this.loaded.has(ctx)) return this.loaded.get(ctx) ?? null;
    const profile = await ctx.manager.findOne(ProgressionProfileEntity, { where: { characterId: ctx.character.id } });
    this.loaded.set(ctx, profile);
    return profile;
  }

  /** Load or create. `created` tells the caller it should seed the rest of the state. */
  async ensure(ctx: SimulationContext): Promise<{ readonly profile: ProgressionProfileEntity; readonly created: boolean }> {
    const existing = await this.peek(ctx);
    if (existing) return { profile: existing, created: false };
    const profile = ctx.manager.create(ProgressionProfileEntity, {
      characterId: ctx.character.id,
      chapter: 1,
      legacyComplete: false,
      clout: 0,
      jobKey: null,
      earnedMark: ctx.character.earnedTotal,
      lastProbedDay: null,
      seededAt: ctx.time,
    });
    await ctx.manager.createQueryBuilder().insert().into(ProgressionProfileEntity).values(profile).orIgnore().execute();
    const stored = (await ctx.manager.findOne(ProgressionProfileEntity, { where: { characterId: ctx.character.id } })) ?? profile;
    this.loaded.set(ctx, stored);
    return { profile: stored, created: true };
  }

  async update(ctx: SimulationContext, profile: ProgressionProfileEntity, patch: ProfilePatch): Promise<void> {
    const changed = (Object.keys(patch) as Array<keyof ProfilePatch>).filter((key) => patch[key] !== undefined && patch[key] !== profile[key]);
    if (changed.length === 0) return;
    Object.assign(profile, patch);
    await ctx.manager.update(ProgressionProfileEntity, { characterId: profile.characterId }, patch);
  }

  /**
   * Grant permanent clout under PROGRESSION_CLOUT_CAP. It shows on the character immediately and keeps flowing
   * through the `status` hook as part of the baseline. Returns what was actually granted.
   */
  async addClout(ctx: SimulationContext, profile: ProgressionProfileEntity, amount: number): Promise<number> {
    const { total, granted } = addCappedClout(profile.clout, amount, PROGRESSION_CLOUT_CAP);
    if (granted <= 0) return 0;
    await this.update(ctx, profile, { clout: total });
    ctx.character.status = Math.min(MAX_STATUS, ctx.character.status + granted);
    return granted;
  }
}
