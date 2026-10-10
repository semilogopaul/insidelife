import { Injectable } from '@nestjs/common';
import { In, LessThanOrEqual } from 'typeorm';
import { MINUTES_PER_YEAR, type JobApplicationStatus } from '@insidelife/shared';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { EmploymentHistoryEntity } from './entities/employment-history.entity.js';
import { EmploymentEntity } from './entities/employment.entity.js';
import { JobApplicationEntity } from './entities/job-application.entity.js';

const EMPLOYMENT_MEMO = 'careers:employment';
/** Most characters have no job: skip the employment read when there's no row (see `RowProbe`). */
export const EMPLOYMENT_ROWS: RowProbe = { key: 'careers:employment', table: 'employments', where: 'character_id = $1' };
const OPEN_STATUSES: readonly JobApplicationStatus[] = ['pending', 'interview'];

/** Persistence for the careers domain, scoped to the locked character and memoised per transaction. */
@Injectable()
export class CareerStore {
  /** The current job, if any (memoised; call `forget` after replacing or deleting it). */
  active(ctx: SimulationContext): Promise<EmploymentEntity | null> {
    return ctx.memo(EMPLOYMENT_MEMO, async () =>
      (await ctx.mayHaveRows(EMPLOYMENT_ROWS)) ? ctx.manager.findOne(EmploymentEntity, { where: { characterId: ctx.character.id } }) : null,
    );
  }

  forget(ctx: SimulationContext): void {
    ctx.invalidate(EMPLOYMENT_MEMO);
  }

  async save(ctx: SimulationContext, employment: EmploymentEntity): Promise<void> {
    await ctx.manager.save(employment);
  }

  /** Cheap counter update used on every work segment. */
  async saveAttendance(ctx: SimulationContext, employment: EmploymentEntity): Promise<void> {
    await ctx.manager.update(EmploymentEntity, employment.id, {
      scheduledMinutesMonth: employment.scheduledMinutesMonth,
      workedMinutesMonth: employment.workedMinutesMonth,
      absentMinutesMonth: employment.absentMinutesMonth,
      lateMinutesMonth: employment.lateMinutesMonth,
      scheduledMinutesDay: employment.scheduledMinutesDay,
      workedMinutesDay: employment.workedMinutesDay,
      lateMinutesDay: employment.lateMinutesDay,
    });
  }

  async remove(ctx: SimulationContext, employment: EmploymentEntity): Promise<void> {
    await ctx.manager.delete(EmploymentEntity, { id: employment.id });
    this.forget(ctx);
  }

  history(ctx: SimulationContext, limit = 20): Promise<EmploymentHistoryEntity[]> {
    return ctx.manager.find(EmploymentHistoryEntity, { where: { characterId: ctx.character.id }, order: { endedAt: 'DESC' }, take: limit });
  }

  async addHistory(ctx: SimulationContext, record: Omit<EmploymentHistoryEntity, 'id' | 'createdAt' | 'characterId'>): Promise<void> {
    await ctx.manager.save(ctx.manager.create(EmploymentHistoryEntity, { ...record, characterId: ctx.character.id }));
  }

  /** Years served per job id: finished employments plus the current one. */
  async experienceYears(ctx: SimulationContext): Promise<Map<string, number>> {
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const history = await ctx.manager.find(EmploymentHistoryEntity, { where: { characterId: ctx.character.id }, select: { jobId: true, startedAt: true, endedAt: true } });
    const current = await this.active(ctx);
    const years = new Map<string, number>();
    const add = (jobId: string, from: number, to: number): void => {
      years.set(jobId, (years.get(jobId) ?? 0) + Math.max(0, to - from) / MINUTES_PER_YEAR);
    };
    for (const record of history) add(record.jobId, record.startedAt, record.endedAt);
    if (current) add(current.jobId, current.startedAt, ctx.time);
    return years;
  }

  openApplications(ctx: SimulationContext): Promise<JobApplicationEntity[]> {
    return ctx.manager.find(JobApplicationEntity, {
      where: { characterId: ctx.character.id, status: In([...OPEN_STATUSES]) },
      order: { decideAt: 'ASC' },
    });
  }

  dueApplications(ctx: SimulationContext): Promise<JobApplicationEntity[]> {
    return ctx.manager.find(JobApplicationEntity, {
      where: { characterId: ctx.character.id, status: In([...OPEN_STATUSES]), decideAt: LessThanOrEqual(ctx.time) },
      order: { decideAt: 'ASC', appliedAt: 'ASC' },
    });
  }

  recentApplications(ctx: SimulationContext, limit = 15): Promise<JobApplicationEntity[]> {
    return ctx.manager.find(JobApplicationEntity, { where: { characterId: ctx.character.id }, order: { appliedAt: 'DESC' }, take: limit });
  }

  applicationsForJob(ctx: SimulationContext, jobId: string): Promise<JobApplicationEntity[]> {
    return ctx.manager.find(JobApplicationEntity, { where: { characterId: ctx.character.id, jobId }, order: { appliedAt: 'DESC' } });
  }

  async saveApplication(ctx: SimulationContext, application: JobApplicationEntity): Promise<JobApplicationEntity> {
    return ctx.manager.save(application);
  }

  createApplication(ctx: SimulationContext, values: Partial<JobApplicationEntity>): JobApplicationEntity {
    return ctx.manager.create(JobApplicationEntity, { ...values, characterId: ctx.character.id });
  }

  createEmployment(ctx: SimulationContext, values: Partial<EmploymentEntity>): EmploymentEntity {
    return ctx.manager.create(EmploymentEntity, { ...values, characterId: ctx.character.id });
  }
}
