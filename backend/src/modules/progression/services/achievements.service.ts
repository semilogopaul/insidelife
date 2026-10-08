import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_RARITIES,
  PROGRESSION_CLOUT_CAP,
  SECRET_ACHIEVEMENT_TEASER,
  type AchievementDefinition,
  type AchievementDto,
  type AchievementSummaryDto,
  type AchievementsOverviewDto,
} from '@insidelife/shared';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { AchievementUnlockEntity } from '../entities/achievement-unlock.entity.js';
import { ProgressionProfileEntity } from '../entities/progression-profile.entity.js';
import {
  ACHIEVEMENT_CONDITION_INDEX,
  achievementClout,
  achievementMatchesTrigger,
  addCappedClout,
  evaluateCondition,
  progressOf,
  rarityPercent,
  secretMasked,
  type EvaluationTrigger,
  type FactSource,
  type ProgressionFacts,
} from '../progression.rules.js';
import { MilestonesService } from './milestones.service.js';
import { ProfilesService } from './profiles.service.js';

export type UnlockedAchievements = Map<string, AchievementUnlockEntity>;

/** More unlocks than this in one go collapse into a single summary notification. */
const NOTIFY_INDIVIDUALLY_UP_TO = 3;
/** Rarity percentages are cached in-process; they're decorative, not gameplay. */
const RARITY_TTL_MS = 5 * 60_000;
const RECENT_COUNT = 3;

const CATALOG: readonly AchievementDefinition[] = ACHIEVEMENTS;

interface RaritySnapshot {
  readonly expiresAt: number;
  readonly counts: ReadonlyMap<string, number>;
  readonly population: number;
}

/** Badges: unlock checks, permanent clout by rarity, milestone hand-off and the badge wall with rarity %. */
@Injectable()
export class AchievementsService {
  private readonly loaded = new WeakMap<SimulationContext, UnlockedAchievements>();
  private rarity: RaritySnapshot | null = null;

  constructor(
    @InjectRepository(AchievementUnlockEntity) private readonly unlocks: Repository<AchievementUnlockEntity>,
    @InjectRepository(ProgressionProfileEntity) private readonly profileRows: Repository<ProgressionProfileEntity>,
    private readonly profiles: ProfilesService,
    private readonly milestones: MilestonesService,
  ) {}

  async unlocked(ctx: SimulationContext): Promise<UnlockedAchievements> {
    const cached = this.loaded.get(ctx);
    if (cached) return cached;
    const rows = await ctx.manager.find(AchievementUnlockEntity, { where: { characterId: ctx.character.id } });
    const unlocked: UnlockedAchievements = new Map(rows.map((row) => [row.achievementId, row]));
    this.loaded.set(ctx, unlocked);
    return unlocked;
  }

  /** Locked achievements worth checking for this trigger. */
  candidates(unlocked: UnlockedAchievements, trigger: EvaluationTrigger): AchievementDefinition[] {
    return CATALOG.filter((achievement) => !unlocked.has(achievement.id) && achievementMatchesTrigger(achievement.id, trigger));
  }

  /** Sources needed to show progress on every locked, visible achievement. */
  progressSources(unlocked: UnlockedAchievements): Set<FactSource> {
    const sources = new Set<FactSource>();
    for (const achievement of CATALOG) {
      if (unlocked.has(achievement.id) || achievement.secret) continue;
      for (const source of ACHIEVEMENT_CONDITION_INDEX.get(achievement.id)?.sources ?? []) sources.add(source);
    }
    return sources;
  }

  /** Unlock earned achievements: record, grant capped clout, queue moments, notify (batched). */
  async unlock(ctx: SimulationContext, unlocked: UnlockedAchievements, earned: readonly AchievementDefinition[]): Promise<AchievementDefinition[]> {
    if (earned.length === 0) return [];
    const { profile } = await this.profiles.ensure(ctx);
    const fresh: Array<{ readonly achievement: AchievementDefinition; readonly clout: number }> = [];
    for (const achievement of earned) {
      if (unlocked.has(achievement.id)) continue;
      const clout = addCappedClout(profile.clout, achievementClout(achievement.rarity), PROGRESSION_CLOUT_CAP).granted;
      const row = ctx.manager.create(AchievementUnlockEntity, {
        characterId: ctx.character.id,
        achievementId: achievement.id,
        unlockedAt: ctx.time,
        clout,
      });
      const result = await ctx.manager.createQueryBuilder().insert().into(AchievementUnlockEntity).values(row).orIgnore().execute();
      if (!Array.isArray(result.raw) || result.raw.length === 0) continue;
      unlocked.set(achievement.id, row);
      await this.profiles.addClout(ctx, profile, clout);
      if (achievement.milestone) await this.milestones.enqueue(ctx, achievement.milestone);
      fresh.push({ achievement, clout });
    }
    this.announce(ctx, fresh);
    return fresh.map((entry) => entry.achievement);
  }

  async summary(ctx: SimulationContext): Promise<AchievementSummaryDto> {
    const unlocked = await this.unlocked(ctx);
    const rarity = await this.raritySnapshot();
    const recent = [...unlocked.values()]
      .toSorted((a, b) => b.unlockedAt - a.unlockedAt || a.achievementId.localeCompare(b.achievementId))
      .slice(0, RECENT_COUNT)
      .flatMap((row) => {
        const achievement = CATALOG.find((candidate) => candidate.id === row.achievementId);
        return achievement ? [this.toDto(achievement, row, rarity, null)] : [];
      });
    return { unlocked: unlocked.size, total: CATALOG.length, recent };
  }

  /** The full badge wall. `facts` (when given) powers progress bars on locked, visible achievements. */
  async list(ctx: SimulationContext, facts: ProgressionFacts | null): Promise<AchievementsOverviewDto> {
    const unlocked = await this.unlocked(ctx);
    const rarity = await this.raritySnapshot();
    const achievements = CATALOG.map((achievement) => this.toDto(achievement, unlocked.get(achievement.id) ?? null, rarity, facts));
    achievements.sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0));
    return { unlocked: unlocked.size, total: CATALOG.length, population: rarity.population, achievements };
  }

  private toDto(
    achievement: AchievementDefinition,
    row: AchievementUnlockEntity | null,
    rarity: RaritySnapshot,
    facts: ProgressionFacts | null,
  ): AchievementDto {
    const unlocked = row !== null;
    const masked = secretMasked(achievement, unlocked);
    const definition = ACHIEVEMENT_RARITIES[achievement.rarity];
    const result = !unlocked && !masked && facts ? evaluateCondition(achievement.condition, facts) : null;
    return {
      id: achievement.id,
      title: masked ? '???' : achievement.title,
      description: masked ? SECRET_ACHIEVEMENT_TEASER : achievement.description,
      icon: masked ? 'lock' : achievement.icon,
      rarity: achievement.rarity,
      rarityLabel: definition.label,
      category: achievement.category,
      secret: achievement.secret === true,
      unlocked,
      unlockedAt: row?.unlockedAt ?? null,
      // The snapshot is cached; always count the viewer's own unlock so a fresh badge never reads 0%.
      rarityPercent: unlocked
        ? rarityPercent(Math.max(1, rarity.counts.get(achievement.id) ?? 0), Math.max(1, rarity.population))
        : rarityPercent(rarity.counts.get(achievement.id) ?? 0, rarity.population),
      clout: row ? row.clout : definition.clout,
      progress: result ? progressOf(result) : null,
    };
  }

  private announce(ctx: SimulationContext, fresh: ReadonlyArray<{ readonly achievement: AchievementDefinition; readonly clout: number }>): void {
    if (fresh.length === 0) return;
    if (fresh.length <= NOTIFY_INDIVIDUALLY_UP_TO) {
      for (const { achievement, clout } of fresh) {
        const rarity = ACHIEVEMENT_RARITIES[achievement.rarity].label;
        ctx.notify({
          kind: 'achievement',
          title: `${achievement.secret ? 'Secret achievement' : 'Achievement'} unlocked: ${achievement.title}`,
          body: `${achievement.description} ${rarity}${clout > 0 ? ` · +${clout} clout` : ''}`,
          tone: 'good',
        });
      }
      return;
    }
    const clout = fresh.reduce((sum, entry) => sum + entry.clout, 0);
    const names = fresh.map((entry) => entry.achievement.title);
    ctx.notify({
      kind: 'achievement',
      title: `${fresh.length} achievements unlocked!`,
      body: `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}.${clout > 0 ? ` +${clout} clout` : ''}`,
      tone: 'good',
    });
  }

  private async raritySnapshot(): Promise<RaritySnapshot> {
    const now = Date.now();
    if (this.rarity && this.rarity.expiresAt > now) return this.rarity;
    const [rows, population] = await Promise.all([
      this.unlocks
        .createQueryBuilder('unlock')
        .select('unlock.achievement_id', 'achievementId')
        .addSelect('COUNT(*)::int', 'unlocks')
        .groupBy('unlock.achievement_id')
        .getRawMany<{ readonly achievementId: string; readonly unlocks: number | string }>(),
      this.profileRows.count(),
    ]);
    this.rarity = {
      expiresAt: now + RARITY_TTL_MS,
      counts: new Map(rows.map((row) => [row.achievementId, Number(row.unlocks)])),
      population,
    };
    return this.rarity;
  }
}
