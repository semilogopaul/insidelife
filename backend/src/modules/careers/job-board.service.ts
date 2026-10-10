import { Injectable } from '@nestjs/common';
import {
  JOBS,
  findJob,
  jobPayRange,
  type JobBoardDto,
  type JobDefinition,
  type JobDetailDto,
  type JobListingDto,
} from '@insidelife/shared';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { MAX_OPEN_APPLICATIONS } from './applications.service.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { applicationDto, scheduleDto, titleOf, workplaceDto } from './career.presenter.js';
import { CareerStore } from './career.store.js';
import type { JobApplicationEntity } from './entities/job-application.entity.js';
import { displayChance, hiringChance } from './rules/hiring.js';
import { allMet, jobRequirementChecks, levelGateLabels, missingLabels, type CandidateProfile } from './rules/requirements.js';

interface BoardContext {
  readonly profile: CandidateProfile;
  readonly currentJobId: string | null;
  readonly openApplications: ReadonlyMap<string, JobApplicationEntity>;
  readonly usdRate: number;
}

/** The Jobs app board: every job with eligibility, what's missing, rough odds, pay and schedule. */
@Injectable()
export class JobBoardService {
  constructor(
    private readonly store: CareerStore,
    private readonly profiles: CandidateProfileService,
  ) {}

  async board(ctx: SimulationContext): Promise<JobBoardDto> {
    const board = await this.context(ctx);
    const recent = await this.store.recentApplications(ctx);
    const jobs = JOBS.map((job) => this.listing(job, board)).toSorted(
      (a, b) => Number(b.eligible) - Number(a.eligible) || a.entryPayNaira - b.entryPayNaira,
    );
    return { jobs, applications: recent.map(applicationDto), currentJobId: board.currentJobId, maxOpenApplications: MAX_OPEN_APPLICATIONS };
  }

  async detail(ctx: SimulationContext, jobId: string): Promise<JobDetailDto> {
    const job = findJob(jobId);
    if (!job) throw new ResourceNotFoundException('Job');
    const listing = this.listing(job, await this.context(ctx));
    return {
      ...listing,
      ladder: job.levels.map((level, index) => ({
        index,
        title: level.title,
        pay: level.pay,
        currency: job.currency,
        minYears: level.minYears,
        gates: levelGateLabels(level),
        breakout: level.breakout === true,
        status: level.status,
      })),
    };
  }

  private async context(ctx: SimulationContext): Promise<BoardContext> {
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const profile = await this.profiles.build(ctx);
    const current = await this.store.active(ctx);
    const open = await this.store.openApplications(ctx);
    return {
      profile,
      currentJobId: current?.jobId ?? null,
      openApplications: new Map(open.map((application) => [application.jobId, application])),
      usdRate: ctx.world.economy(ctx.time).usdRate,
    };
  }

  private listing(job: JobDefinition, board: BoardContext): JobListingDto {
    const checks = jobRequirementChecks(job, board.profile);
    const eligible = allMet(checks);
    const range = jobPayRange(job);
    const entryPay = job.levels[0]?.pay ?? 0;
    const application = board.openApplications.get(job.id);
    return {
      id: job.id,
      title: job.title,
      entryTitle: titleOf(job, 0),
      employer: job.employer,
      industry: job.industry,
      sector: job.sector,
      emoji: job.emoji,
      blurb: job.blurb,
      workplace: workplaceDto(job),
      schedule: scheduleDto(job),
      currency: job.currency,
      payRange: { min: range.min, max: range.max, currency: job.currency },
      entryPayNaira: Math.round(job.currency === 'USD' ? entryPay * board.usdRate : entryPay),
      perks: job.perks,
      stress: job.stress,
      levels: job.levels.length,
      eligible,
      requirements: checks,
      missing: missingLabels(checks),
      estimatedChance: eligible ? displayChance(hiringChance(job, board.profile)) : 0,
      application: application ? applicationDto(application) : null,
      current: board.currentJobId === job.id,
    };
  }
}
