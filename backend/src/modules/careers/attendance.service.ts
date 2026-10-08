import { Injectable } from '@nestjs/common';
import {
  BACKGROUNDS,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  applySkillXp,
  findAction,
  findJob,
  moodPerformanceMultiplier,
  type GameMinute,
  type JobDefinition,
  type SkillKey,
} from '@insidelife/shared';
import type { ScheduleBlock, Segment } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { employerOf } from './career.presenter.js';
import { CareerStore } from './career.store.js';
import type { EmploymentEntity } from './entities/employment.entity.js';
import { EmploymentService } from './employment.service.js';
import { applyAttendanceDiscipline, dayPerformance, rollPerformance, skillFit } from './rules/performance.js';
import { attendanceRatio, classifyShiftTime, overlapMinutes, shiftForDay, type WorkShift } from './rules/schedule.js';

/** Work beats lectures on the routine; hospital and trips abroad beat work. */
const WORK_BLOCK_PRIORITY = 30;
/** Daily decay of the boss's goodwill from life events. */
const GOODWILL_DECAY = 0.98;

/**
 * The job on the daily routine: work blocks, attendance accounting per timeline segment (explicit actions during
 * work hours count as absence), skill growth on the job, daily performance and discipline.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly store: CareerStore,
    private readonly planner: TimelinePlanner,
    private readonly engine: SimulationEngine,
    private readonly employment: EmploymentService,
  ) {}

  async blocksForDay(ctx: SimulationContext, dayIndex: number): Promise<readonly ScheduleBlock[]> {
    const employment = await this.store.active(ctx);
    const job = employment ? findJob(employment.jobId) : undefined;
    if (!employment || !job) return [];
    const shift = this.shift(ctx, job, employment, dayIndex);
    if (!shift) return [];
    return [
      {
        kind: 'work',
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        locationId: await this.workLocation(ctx, job, shift.startsAt),
        label: `Work — ${employerOf(job, employment)}`,
        priority: WORK_BLOCK_PRIORITY,
        commute: true,
      },
    ];
  }

  /** Count a timeline segment against any shift it overlaps. */
  async record(ctx: SimulationContext, segment: Segment): Promise<void> {
    const employment = await this.store.active(ctx);
    if (!employment || segment.endsAt <= employment.startedAt) return;
    const job = findJob(employment.jobId);
    if (!job) return;

    const day = Math.floor(segment.startsAt / MINUTES_PER_DAY);
    let worked = 0;
    let late = 0;
    let absent = 0;
    for (const candidate of [day - 1, day]) {
      const shift = this.shift(ctx, job, employment, candidate);
      if (!shift) continue;
      const minutes = overlapMinutes(shift.startsAt, shift.endsAt, segment.startsAt, segment.endsAt);
      if (minutes <= 0) continue;
      const actionCategory = segment.actionId ? findAction(segment.actionId)?.category : undefined;
      const kind = classifyShiftTime({ kind: segment.kind, locationId: segment.locationId, actionCategory }, await this.workLocation(ctx, job, shift.startsAt));
      if (kind === 'worked') worked += minutes;
      else if (kind === 'late') late += minutes;
      else if (kind === 'absent') absent += minutes;
    }
    const scheduled = worked + late + absent;
    if (scheduled === 0) return;

    employment.scheduledMinutesMonth += scheduled;
    employment.workedMinutesMonth += worked;
    employment.lateMinutesMonth += late;
    employment.absentMinutesMonth += absent;
    employment.scheduledMinutesDay += scheduled;
    employment.workedMinutesDay += worked;
    employment.lateMinutesDay += late;
    await this.store.saveAttendance(ctx, employment);
    if (worked > 0) this.learnOnTheJob(ctx, job, worked);
  }

  /** Day end: performance, discipline (query letter → sack), leave housekeeping. */
  async closeDay(ctx: SimulationContext): Promise<void> {
    const employment = await this.store.active(ctx);
    const job = employment ? findJob(employment.jobId) : undefined;
    if (!employment || !job) return;

    const scheduled = employment.scheduledMinutesDay;
    if (scheduled > 0) {
      const ratio = attendanceRatio(scheduled, employment.workedMinutesDay, employment.lateMinutesDay);
      const mood = moodPerformanceMultiplier(this.engine.mood(ctx));
      employment.performance = rollPerformance(employment.performance, dayPerformance(ratio, mood, skillFit(job, employment.level, ctx.character.skills)), employment.goodwill);

      const discipline = applyAttendanceDiscipline(employment, ratio, ctx.time, MINUTES_PER_DAY);
      employment.strikes = discipline.state.strikes;
      employment.warnings = discipline.state.warnings;
      employment.lastWarningAt = discipline.state.lastWarningAt;
      if (discipline.outcome === 'fired') {
        this.resetDay(employment);
        await this.employment.end(ctx, employment, 'fired');
        return;
      }
      if (discipline.outcome === 'warning') {
        ctx.notify({
          kind: 'career',
          title: 'Query letter 📄',
          body: `HR at ${employerOf(job, employment)} wants to know why you keep missing work. One more stretch of absence and you’re out.`,
          tone: 'bad',
        });
        ctx.report({ label: 'Got a query letter for absence', tone: 'bad' });
      }
    }

    employment.goodwill *= GOODWILL_DECAY;
    if (employment.leaveUntil !== null && employment.leaveUntil <= ctx.time) {
      employment.leaveFrom = null;
      employment.leaveUntil = null;
    }
    this.resetDay(employment);
    await this.store.save(ctx, employment);
  }

  private resetDay(employment: EmploymentEntity): void {
    employment.scheduledMinutesDay = 0;
    employment.workedMinutesDay = 0;
    employment.lateMinutesDay = 0;
  }

  private shift(ctx: SimulationContext, job: JobDefinition, employment: EmploymentEntity, dayIndex: number): WorkShift | null {
    return shiftForDay(job, employment, dayIndex, (t: GameMinute) => ctx.world.isActive(t, 'public-holiday'));
  }

  /** Remote jobs happen wherever you sleep; everything else at the workplace venue. */
  private async workLocation(ctx: SimulationContext, job: JobDefinition, t: GameMinute): Promise<string> {
    if (job.workMode !== 'remote') return job.workplaceId;
    return (await this.planner.residence(ctx, t)).locationId;
  }

  private learnOnTheJob(ctx: SimulationContext, job: JobDefinition, minutes: number): void {
    const character = ctx.character;
    const hours = minutes / MINUTES_PER_HOUR;
    const mood = moodPerformanceMultiplier(this.engine.mood(ctx));
    const background = BACKGROUNDS[character.background];
    const skills: Record<SkillKey, number> = { ...character.skills };
    for (const [skill, perHour] of Object.entries(job.skillXpPerHour) as Array<[SkillKey, number]>) {
      const backgroundFactor = skill === 'hustle' ? background.hustleGain : background.studyGain;
      skills[skill] = applySkillXp(skills[skill], perHour * hours * mood * backgroundFactor);
    }
    character.skills = skills;
  }
}
