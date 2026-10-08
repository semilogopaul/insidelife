import {
  MINUTES_PER_DAY,
  MINUTES_PER_YEAR,
  findJob,
  findVenue,
  formatJobSchedule,
  weeklyJobHours,
  type DistrictId,
  type EmploymentHistoryDto,
  type JobApplicationDto,
  type JobDefinition,
  type JobScheduleDto,
  type JobWorkplaceDto,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { EmploymentHistoryEntity } from './entities/employment-history.entity.js';
import type { EmploymentEntity } from './entities/employment.entity.js';
import type { JobApplicationEntity } from './entities/job-application.entity.js';

/** Pure mappers from catalog + entities to API DTOs. */

/** The catalog entry for a stored job id (jobs are never removed from the catalog while held). */
export function requireJob(jobId: string): JobDefinition {
  const job = findJob(jobId);
  if (!job) throw new GameRuleException('JOB_RETIRED', 'This job no longer exists');
  return job;
}

export function employerOf(job: JobDefinition, employment?: Pick<EmploymentEntity, 'employerOverride'> | null): string {
  return employment?.employerOverride ?? job.employer;
}

export function titleOf(job: JobDefinition, level: number): string {
  return job.levels[Math.min(Math.max(0, level), job.levels.length - 1)]?.title ?? job.title;
}

export function workplaceDto(job: JobDefinition): JobWorkplaceDto {
  const venue = findVenue(job.workplaceId);
  const name = venue?.name ?? job.workplaceId;
  const districtId: DistrictId = venue?.districtId ?? 'yaba';
  const label = job.workMode === 'remote' ? 'Remote — from home' : job.workMode === 'roaming' ? `On the road (from ${name})` : name;
  return { venueId: job.workplaceId, name, districtId, mode: job.workMode, label };
}

export function scheduleDto(job: JobDefinition): JobScheduleDto {
  return {
    days: [...job.schedule.days],
    startHour: job.schedule.startHour,
    hours: job.schedule.hours,
    weeklyHours: weeklyJobHours(job),
    label: formatJobSchedule(job.schedule),
  };
}

export function applicationDto(application: JobApplicationEntity): JobApplicationDto {
  const job = findJob(application.jobId);
  return {
    id: application.id,
    jobId: application.jobId,
    jobTitle: job ? titleOf(job, 0) : application.jobId,
    employer: job?.employer ?? 'Unknown employer',
    status: application.status,
    appliedAt: application.appliedAt,
    // Decisions are processed at the end of the decision day.
    decisionExpectedBy: (Math.floor(application.decideAt / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY,
    decidedAt: application.decidedAt,
    interview: application.status === 'interview' || application.interviewCardDealt,
    message: application.message,
  };
}

export function historyDto(record: EmploymentHistoryEntity): EmploymentHistoryDto {
  return {
    id: record.id,
    jobId: record.jobId,
    title: record.title,
    employer: record.employer,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    years: Math.round(((record.endedAt - record.startedAt) / MINUTES_PER_YEAR) * 100) / 100,
    reason: record.reason,
    totalEarned: record.totalEarned,
  };
}
