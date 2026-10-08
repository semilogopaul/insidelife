import { Injectable } from '@nestjs/common';
import {
  PROGRESSION_CLOUT_CAP,
  type AchievementsOverviewDto,
  type DailyWelcomeResultDto,
  type MilestoneAcknowledgementDto,
  type MilestoneMomentDto,
  type ProgressionOverviewDto,
  type SuggestionDto,
} from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { GOAL_CONDITION_INDEX, lagosDay, type FactSource } from './progression.rules.js';
import { ProgressionSystem } from './progression.system.js';
import { AchievementsService } from './services/achievements.service.js';
import { CountersService } from './services/counters.service.js';
import { DailyWelcomeService } from './services/daily-welcome.service.js';
import { FactsService } from './services/facts.service.js';
import { GoalsService } from './services/goals.service.js';
import { MilestonesService } from './services/milestones.service.js';
import { ProfilesService } from './services/profiles.service.js';
import { SuggestionsService } from './services/suggestions.service.js';

/** Sunday in Africa/Lagos — "Mama's Sunday rice" counts toward a badge. */
const SUNDAY = 0;

/** Read models and commands behind the progression endpoints. Every method runs inside a `CharacterSession`. */
@Injectable()
export class ProgressionService {
  constructor(
    private readonly system: ProgressionSystem,
    private readonly goals: GoalsService,
    private readonly achievements: AchievementsService,
    private readonly milestones: MilestonesService,
    private readonly dailyWelcome: DailyWelcomeService,
    private readonly suggestions: SuggestionsService,
    private readonly counters: CountersService,
    private readonly profiles: ProfilesService,
    private readonly facts: FactsService,
  ) {}

  async overview(ctx: SimulationContext, userId: string, nowMs: number): Promise<ProgressionOverviewDto> {
    await this.system.refresh(ctx);
    const rows = await this.goals.rows(ctx);
    const sources = new Set<FactSource>();
    for (const row of rows.values()) {
      if (row.status !== 'active') continue;
      for (const source of GOAL_CONDITION_INDEX.get(row.goalId)?.sources ?? []) sources.add(source);
    }
    const facts = await this.facts.gather(ctx, sources);
    const { profile } = await this.profiles.ensure(ctx);
    return {
      ...this.goals.view(rows, facts),
      achievements: await this.achievements.summary(ctx),
      pendingMilestones: await this.milestones.countPending(ctx),
      dailyWelcome: await this.dailyWelcome.status(ctx, userId, nowMs),
      clout: { earned: profile.clout, cap: PROGRESSION_CLOUT_CAP },
    };
  }

  async achievementsOverview(ctx: SimulationContext): Promise<AchievementsOverviewDto> {
    await this.system.refresh(ctx);
    const unlocked = await this.achievements.unlocked(ctx);
    const facts = await this.facts.gather(ctx, this.achievements.progressSources(unlocked));
    return this.achievements.list(ctx, facts);
  }

  async pendingMilestones(ctx: SimulationContext): Promise<MilestoneMomentDto[]> {
    await this.system.ensureSeeded(ctx);
    return this.milestones.pending(ctx);
  }

  acknowledgeMilestone(ctx: SimulationContext, id: string): Promise<MilestoneAcknowledgementDto> {
    return this.milestones.acknowledge(ctx, id);
  }

  async claimDailyWelcome(ctx: SimulationContext, userId: string, nowMs: number): Promise<DailyWelcomeResultDto> {
    await this.system.ensureSeeded(ctx);
    const result = await this.dailyWelcome.claim(ctx, userId, nowMs);
    if (result.status === 'granted' && lagosDay(nowMs).weekday === SUNDAY) {
      const changed = await this.counters.increment(ctx, new Map([['welcome-sunday', 1]]));
      await this.system.evaluate(ctx, { kind: 'counters', keys: new Set(changed) });
    }
    return result;
  }

  async nextSteps(ctx: SimulationContext): Promise<SuggestionDto[]> {
    await this.system.ensureSeeded(ctx);
    return this.suggestions.suggest(ctx);
  }
}
