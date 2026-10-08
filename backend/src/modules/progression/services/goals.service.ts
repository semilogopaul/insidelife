import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import {
  LIFE_CHAPTERS,
  LIFE_GOALS,
  findLifeChapter,
  type LifeChapterDefinition,
  type LifeChapterDto,
  type LifeGoalDefinition,
  type LifeGoalDto,
  type LifeGoalPath,
  type LifeGoalStatus,
  type NextChapterPreviewDto,
  type ProgressionOverviewDto,
  type VenueType,
} from '@insidelife/shared';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { LifeGoalProgressEntity } from '../entities/life-goal-progress.entity.js';
import type { ProgressionProfileEntity } from '../entities/progression-profile.entity.js';
import {
  chapterState,
  evaluateCondition,
  goalMatchesTrigger,
  goalStatusFor,
  progressOf,
  satisfiedPathId,
  type EvaluationTrigger,
  type ProgressionFacts,
} from '../progression.rules.js';
import { MilestonesService } from './milestones.service.js';
import { ProfilesService } from './profiles.service.js';
import { RewardsService, type GrantedReward } from './rewards.service.js';

export type GoalRows = Map<string, LifeGoalProgressEntity>;

export interface CompletedGoal {
  readonly goal: LifeGoalDefinition;
  readonly pathId: string | null;
  readonly granted: GrantedReward;
}

export interface ChapterTransition {
  readonly current: number;
  /** Goals that just became active (new chapter or prerequisites met). */
  readonly newlyActive: ReadonlySet<string>;
}

export type GoalsView = Pick<ProgressionOverviewDto, 'chapter' | 'chapters' | 'activeGoals' | 'completedGoals' | 'nextChapter' | 'legacyComplete'>;

/** The catalog widened to its interface (optional fields readable on every entry). */
const GOALS: readonly LifeGoalDefinition[] = LIFE_GOALS;

const completedIds = (rows: GoalRows): Set<string> =>
  new Set([...rows.values()].filter((row) => row.status === 'completed').map((row) => row.goalId));

/**
 * Life Goals: rows per character (seeded lazily, so catalog additions and pre-existing characters just work),
 * completion with rewards and celebrations, and the chapter machine (next chapter unlocks when every required goal
 * of the current one is done; optional goals never block).
 */
@Injectable()
export class GoalsService {
  private readonly loaded = new WeakMap<SimulationContext, GoalRows>();

  constructor(
    private readonly profiles: ProfilesService,
    private readonly rewards: RewardsService,
    private readonly milestones: MilestonesService,
  ) {}

  /** The character's goal rows, creating any catalog goal they don't have yet ("Born in Lagos" starts ticked). */
  async rows(ctx: SimulationContext): Promise<GoalRows> {
    const cached = this.loaded.get(ctx);
    if (cached) return cached;
    const characterId = ctx.character.id;
    let rows: GoalRows = new Map((await ctx.manager.find(LifeGoalProgressEntity, { where: { characterId } })).map((row) => [row.goalId, row]));

    const missing = GOALS.filter((goal) => !rows.has(goal.id));
    if (missing.length > 0) {
      const completed = completedIds(rows);
      for (const goal of missing) if (goal.preCompleted) completed.add(goal.id);
      const { current } = chapterState(completed);
      const drafts = missing.map((goal) => {
        const preCompleted = goal.preCompleted === true;
        return ctx.manager.create(LifeGoalProgressEntity, {
          characterId,
          goalId: goal.id,
          chapter: goal.chapter,
          status: preCompleted ? 'completed' : goalStatusFor(goal, completed, current),
          pathId: null,
          completedAt: preCompleted ? ctx.time : null,
          rewarded: preCompleted,
          rewardCash: 0,
          rewardClout: 0,
        });
      });
      await ctx.manager.createQueryBuilder().insert().into(LifeGoalProgressEntity).values(drafts).orIgnore().execute();
      rows = new Map((await ctx.manager.find(LifeGoalProgressEntity, { where: { characterId } })).map((row) => [row.goalId, row]));
    }
    this.loaded.set(ctx, rows);
    return rows;
  }

  /** Active goals worth checking for this trigger. */
  candidates(rows: GoalRows, trigger: EvaluationTrigger): LifeGoalDefinition[] {
    return GOALS.filter((goal) => rows.get(goal.id)?.status === 'active' && goalMatchesTrigger(goal.id, trigger));
  }

  /** Complete a goal whose condition is met: pay out once, record the path, celebrate. */
  async complete(
    ctx: SimulationContext,
    profile: ProgressionProfileEntity,
    rows: GoalRows,
    goal: LifeGoalDefinition,
    facts: ProgressionFacts,
  ): Promise<CompletedGoal | null> {
    const row = rows.get(goal.id);
    if (!row || row.status === 'completed') return null;
    const pathId = satisfiedPathId(goal, facts);
    const bonusMet = goal.bonus ? evaluateCondition(goal.bonus.condition, facts).met : false;
    const granted: GrantedReward = row.rewarded ? { cash: 0, clout: 0, item: null } : await this.rewards.grantGoal(ctx, profile, goal, bonusMet);

    const patch = {
      status: 'completed' as LifeGoalStatus,
      pathId,
      completedAt: ctx.time,
      rewarded: true,
      rewardCash: granted.cash,
      rewardClout: granted.clout,
    };
    Object.assign(row, patch);
    await ctx.manager.update(LifeGoalProgressEntity, { id: row.id }, patch);

    const path = goal.paths?.find((candidate) => candidate.id === pathId);
    const milestone = path?.milestone ?? goal.milestone;
    if (milestone) await this.milestones.enqueue(ctx, milestone, { detail: path ? ` — ${path.label}` : '' });

    const bonusLine = bonusMet && goal.bonus ? `Bonus: ${goal.bonus.label}!` : '';
    ctx.notify({
      kind: 'achievement',
      title: `Life Goal complete: ${goal.title}`,
      body: [goal.doneText, bonusLine, this.rewards.describe(granted)].filter((part) => part.length > 0).join(' '),
      tone: 'good',
      amount: granted.cash > 0 ? granted.cash : undefined,
    });
    return { goal, pathId, granted };
  }

  /** Recompute statuses and the chapter after completions; celebrate finished chapters. */
  async syncChapters(ctx: SimulationContext, profile: ProgressionProfileEntity, rows: GoalRows): Promise<ChapterTransition> {
    const completed = completedIds(rows);
    const state = chapterState(completed);
    const newlyActive = new Set<string>();
    const changed = new Map<LifeGoalStatus, string[]>();
    for (const goal of GOALS) {
      const row = rows.get(goal.id);
      if (!row || row.status === 'completed') continue;
      const status = goalStatusFor(goal, completed, state.current);
      if (status === row.status) continue;
      row.status = status;
      if (status === 'active') newlyActive.add(goal.id);
      changed.set(status, [...(changed.get(status) ?? []), row.id]);
    }
    for (const [status, ids] of changed) await ctx.manager.update(LifeGoalProgressEntity, { id: In(ids) }, { status });

    for (let number = profile.chapter; number < state.current; number++) {
      const finished = findLifeChapter(number);
      const next = findLifeChapter(number + 1);
      if (!finished) continue;
      await this.milestones.enqueue(ctx, 'chapter-complete', { occurrence: `chapter-${number}`, detail: `Chapter ${number}: ${finished.title}` });
      ctx.notify({
        kind: 'achievement',
        title: `Chapter ${number} complete: ${finished.title}`,
        body: next ? `Next up — Chapter ${next.number}: ${next.title}. ${next.tagline}` : 'Every chapter done. Legend!',
        tone: 'good',
      });
    }
    if (state.legacyComplete && !profile.legacyComplete) {
      await this.milestones.enqueue(ctx, 'legacy-complete');
      ctx.notify({ kind: 'achievement', title: 'Every Life Goal complete', body: 'From Born in Lagos to Legacy. What a life!', tone: 'good' });
    }
    await this.profiles.update(ctx, profile, { chapter: state.current, legacyComplete: state.legacyComplete });
    return { current: state.current, newlyActive };
  }

  /** Checklist view for the client. `facts` should cover the sources of the active goals (for progress bars). */
  view(rows: GoalRows, facts: ProgressionFacts): GoalsView {
    const completed = completedIds(rows);
    const state = chapterState(completed);
    const dto = (goal: LifeGoalDefinition): LifeGoalDto => this.goalDto(goal, rows, facts);

    const active = GOALS.filter((goal) => rows.get(goal.id)?.status === 'active')
      .toSorted((a, b) => Number(b.chapter === state.current) - Number(a.chapter === state.current) || a.chapter - b.chapter || a.order - b.order)
      .map(dto);
    const done = GOALS.filter((goal) => rows.get(goal.id)?.status === 'completed')
      .toSorted((a, b) => a.chapter - b.chapter || a.order - b.order)
      .map(dto);

    const chapterDto = (chapter: LifeChapterDefinition): LifeChapterDto => {
      const goals = GOALS.filter((goal) => goal.chapter === chapter.number);
      const requiredRemaining = goals.filter((goal) => !goal.optional && !completed.has(goal.id)).length;
      return {
        number: chapter.number,
        id: chapter.id,
        title: chapter.title,
        tagline: chapter.tagline,
        completedGoals: goals.filter((goal) => completed.has(goal.id)).length,
        totalGoals: goals.length,
        requiredRemaining,
        complete: requiredRemaining === 0,
        unlocked: chapter.number <= state.current,
      };
    };
    const chapters = LIFE_CHAPTERS.map(chapterDto);
    const currentChapter = chapterDto(findLifeChapter(state.current) ?? LIFE_CHAPTERS[0]);

    const upcoming = state.legacyComplete ? undefined : findLifeChapter(state.current + 1);
    const nextChapter: NextChapterPreviewDto | null = upcoming
      ? {
          number: upcoming.number,
          title: upcoming.title,
          tagline: upcoming.tagline,
          goals: GOALS.filter((goal) => goal.chapter === upcoming.number)
            .toSorted((a, b) => a.order - b.order)
            .map((goal) => ({ id: goal.id, title: goal.title, optional: goal.optional === true })),
        }
      : null;

    return { chapter: currentChapter, chapters, activeGoals: active, completedGoals: done, nextChapter, legacyComplete: state.legacyComplete };
  }

  /** First active goal to suggest in the HUD: current chapter's required goals first. */
  nextGoal(rows: GoalRows): LifeGoalDefinition | null {
    const state = chapterState(completedIds(rows));
    const active = GOALS.filter((goal) => rows.get(goal.id)?.status === 'active');
    active.sort(
      (a, b) =>
        Number(b.chapter === state.current) - Number(a.chapter === state.current) ||
        Number(a.optional === true) - Number(b.optional === true) ||
        a.chapter - b.chapter ||
        a.order - b.order,
    );
    return active[0] ?? null;
  }

  private goalDto(goal: LifeGoalDefinition, rows: GoalRows, facts: ProgressionFacts): LifeGoalDto {
    const row = rows.get(goal.id);
    const status: LifeGoalStatus = row?.status ?? 'locked';
    const result = status === 'active' ? evaluateCondition(goal.condition, facts) : null;
    const paths = (goal.paths ?? []).map((path: LifeGoalPath) => ({
      id: path.id,
      label: path.label,
      hint: path.hint,
      targetVenueTypes: [...(path.targetVenueTypes ?? [])],
      met: status === 'completed' ? row?.pathId === path.id : status === 'active' && evaluateCondition(path.condition, facts).met,
    }));
    const venueTypes = new Set<VenueType>([...(goal.targetVenueTypes ?? []), ...paths.flatMap((path) => path.targetVenueTypes)]);
    return {
      id: goal.id,
      chapter: goal.chapter,
      order: goal.order,
      title: goal.title,
      description: goal.description,
      hint: goal.hint,
      status,
      optional: goal.optional === true,
      targetVenueTypes: [...venueTypes],
      suggestedActionId: goal.suggestedActionId ?? null,
      paths,
      completedPathId: status === 'completed' ? (row?.pathId ?? null) : null,
      progress: result ? progressOf(result) : null,
      reward: {
        cash: goal.reward.cash,
        clout: goal.reward.clout,
        item: goal.reward.item?.label ?? null,
        bonus: goal.bonus ? { label: goal.bonus.label, cash: goal.bonus.cash, clout: goal.bonus.clout } : null,
      },
      celebration: goal.celebration,
      completedAt: status === 'completed' ? (row?.completedAt ?? null) : null,
      granted: status === 'completed' && row ? { cash: row.rewardCash, clout: row.rewardClout } : null,
    };
  }
}
