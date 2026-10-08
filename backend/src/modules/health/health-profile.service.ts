import { Injectable } from '@nestjs/common';
import { MINUTES_PER_DAY } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HealthProfileEntity, type HealthProtection } from './entities/health-profile.entity.js';
import { HEALTH_MEMO } from './health.constants.js';

/** Per-character health bookkeeping (streaks, protections), created lazily on first use. */
@Injectable()
export class HealthProfileService {
  async get(ctx: SimulationContext): Promise<HealthProfileEntity> {
    return ctx.memo(HEALTH_MEMO.profile, async () => {
      const existing = await ctx.manager.findOne(HealthProfileEntity, { where: { characterId: ctx.character.id } });
      if (existing) return existing;
      return ctx.manager.save(
        ctx.manager.create(HealthProfileEntity, {
          characterId: ctx.character.id,
          lowNeedStreak: 0,
          stressStreak: 0,
          protections: {},
          lastDrift: null,
          familyRescueAt: null,
        }),
      );
    });
  }

  async save(ctx: SimulationContext, profile: HealthProfileEntity): Promise<void> {
    await ctx.manager.save(profile);
  }

  isProtected(profile: HealthProfileEntity, protection: HealthProtection, t: number): boolean {
    return (profile.protections[protection] ?? 0) > t;
  }

  /** Extend a protection by `days` from now (or from its current end, whichever is later). */
  async protect(ctx: SimulationContext, protection: HealthProtection, days: number): Promise<void> {
    const profile = await this.get(ctx);
    const from = Math.max(ctx.time, profile.protections[protection] ?? 0);
    profile.protections = { ...profile.protections, [protection]: from + days * MINUTES_PER_DAY };
    await this.save(ctx, profile);
  }

  /** A doctor's rest order (or a proper break) wipes the accumulated stress. */
  async resetStress(ctx: SimulationContext): Promise<void> {
    const profile = await this.get(ctx);
    profile.stressStreak = 0;
    await this.save(ctx, profile);
  }

  async adjustStress(ctx: SimulationContext, delta: number): Promise<void> {
    const profile = await this.get(ctx);
    profile.stressStreak = Math.max(0, profile.stressStreak + delta);
    await this.save(ctx, profile);
  }
}
