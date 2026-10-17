import { Injectable } from '@nestjs/common';
import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  findJob,
  type JobApplicationDto,
  type JobDefinition,
  CITIES,
  cityOfVenueId,
  jobInCity,
} from '@insidelife/shared';
import { ConflictException, GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { applicationDto, titleOf } from './career.presenter.js';
import { CareerStore } from './career.store.js';
import type { JobApplicationEntity } from './entities/job-application.entity.js';
import { EmploymentService } from './employment.service.js';
import { INTERVIEW_BONUS_RANGE, hiringChance } from './rules/hiring.js';
import { levelPay } from './rules/payroll.js';
import { allMet, jobRequirementChecks, missingLabels } from './rules/requirements.js';

/** Open applications allowed at once. */
export const MAX_OPEN_APPLICATIONS = 5;
/** Cool-off after a rejection before applying to the same job again. */
export const REAPPLY_COOLDOWN_DAYS = 7;
/** Employers reply at close of business on the decision day. */
const DECISION_HOUR = 17;

const REJECTIONS = [
  'We regret to inform you that you were not successful at this time.',
  'The position has been filled by the MD’s nephew.',
  'They said they’ll “get back to you”. They did not.',
  'HR liked you, but the budget for the role “was frozen”.',
  'Another candidate had more experience — and a better uncle.',
] as const;

/**
 * Job applications: eligibility checks, seeded decisions after 2-5 game days, and the optional interview stage
 * (a life-event card whose choices change the odds).
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly store: CareerStore,
    private readonly profiles: CandidateProfileService,
    private readonly employment: EmploymentService,
  ) {}

  async apply(ctx: SimulationContext, jobId: string): Promise<JobApplicationDto> {
    const job = findJob(jobId);
    if (!job) throw new ResourceNotFoundException('Job');
    // Jobs are in a city: you can browse the other city's board, but you apply from the city you live in.
    if (!jobInCity(job, ctx.character.cityId)) {
      throw new GameRuleException('OTHER_CITY', `${job.employer} is in ${CITIES[cityOfVenueId(job.workplaceId) ?? 'lagos'].name}. Move there first, then apply.`);
    }

    const current = await this.store.active(ctx);
    if (current?.jobId === job.id) throw new GameRuleException('ALREADY_EMPLOYED_HERE', `You already work at ${job.employer}`);

    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const open = await this.store.openApplications(ctx);
    const previous = await this.store.applicationsForJob(ctx, job.id);
    if (open.some((application) => application.jobId === job.id)) {
      throw new ConflictException('ALREADY_APPLIED', `Your application to ${job.employer} is still being reviewed`);
    }
    if (open.length >= MAX_OPEN_APPLICATIONS) {
      throw new GameRuleException('TOO_MANY_APPLICATIONS', `You have ${open.length} applications pending. Wait for replies first`);
    }
    const rejectedAt = previous.find((application) => application.status === 'rejected')?.decidedAt ?? null;
    if (rejectedAt !== null && ctx.time - rejectedAt < REAPPLY_COOLDOWN_DAYS * MINUTES_PER_DAY) {
      throw new GameRuleException('REAPPLY_LATER', `${job.employer} turned you down recently. Try again in a few days`);
    }

    const checks = jobRequirementChecks(job, await this.profiles.build(ctx));
    if (!allMet(checks)) throw new GameRuleException('NOT_ELIGIBLE', `You don’t meet the requirements yet: ${missingLabels(checks).join(', ')}`);

    // Seeded by job and attempt number: refreshing or re-applying can never re-roll the same application.
    const rng = ctx.rng('job-application', job.id, previous.length);
    const days = job.sector === 'informal' || job.sector === 'creative' ? rng.int(2, 3) : rng.int(3, 5);
    const interview = rng.chance(job.hiring.interviewChance);
    const application = await this.store.saveApplication(
      ctx,
      this.store.createApplication(ctx, {
        jobId: job.id,
        status: interview ? 'interview' : 'pending',
        appliedAt: ctx.time,
        decideAt: (Math.floor(ctx.time / MINUTES_PER_DAY) + days) * MINUTES_PER_DAY + DECISION_HOUR * MINUTES_PER_HOUR,
        decidedAt: null,
        interviewBonus: 0,
        interviewCardDealt: false,
        message: interview ? 'Shortlisted — expect an interview invite.' : null,
      }),
    );
    return applicationDto(application);
  }

  /** Day end: employers reply to every application whose decision day has come. */
  async decideDue(ctx: SimulationContext): Promise<void> {
    for (const application of await this.store.dueApplications(ctx)) {
      const job = findJob(application.jobId);
      application.decidedAt = ctx.time;
      if (!job) {
        await this.close(ctx, application, 'rejected', 'The vacancy was withdrawn.');
        continue;
      }
      await this.decide(ctx, application, job);
    }
  }

  /** Applications waiting for an interview card that can still influence the decision. */
  async interviewCandidates(ctx: SimulationContext): Promise<JobApplicationEntity[]> {
    const open = await this.store.openApplications(ctx);
    return open.filter((application) => application.status === 'interview' && !application.interviewCardDealt && application.decideAt >= ctx.time);
  }

  /** Deal the interview card for the earliest candidate (marks it so it's never dealt twice). */
  async dealInterviewCard(ctx: SimulationContext): Promise<JobApplicationEntity | null> {
    const [candidate] = await this.interviewCandidates(ctx);
    if (!candidate) return null;
    candidate.interviewCardDealt = true;
    candidate.message = 'Interview invite received.';
    return this.store.saveApplication(ctx, candidate);
  }

  /** Record how the interview went. No effect once the employer has decided. */
  async recordInterview(ctx: SimulationContext, applicationId: string, bonus: number, note: string): Promise<void> {
    const application = (await this.store.openApplications(ctx)).find((candidate) => candidate.id === applicationId);
    if (!application) return;
    application.interviewBonus = Math.min(INTERVIEW_BONUS_RANGE.max, Math.max(INTERVIEW_BONUS_RANGE.min, bonus));
    application.message = note;
    await this.store.saveApplication(ctx, application);
  }

  private async decide(ctx: SimulationContext, application: JobApplicationEntity, job: JobDefinition): Promise<void> {
    const profile = await this.profiles.build(ctx);
    const checks = jobRequirementChecks(job, profile);
    const rng = ctx.rng('job-decision', application.jobId, application.appliedAt);
    if (!allMet(checks)) {
      await this.close(ctx, application, 'rejected', `By the time they reviewed it, you no longer met: ${missingLabels(checks).join(', ')}.`);
      return;
    }
    if (rng.next() >= hiringChance(job, profile, application.interviewBonus)) {
      await this.close(ctx, application, 'rejected', rng.pick(REJECTIONS));
      return;
    }

    const current = await this.store.active(ctx);
    if (current?.jobId === job.id) {
      await this.close(ctx, application, 'declined', 'You already work there.');
      return;
    }
    const currentJob = current ? findJob(current.jobId) : undefined;
    if (current && currentJob) {
      const usdRate = ctx.world.economy(ctx.time).usdRate;
      const toNaira = (definition: JobDefinition, pay: number): number => (definition.currency === 'USD' ? pay * usdRate : pay);
      const currentPay = toNaira(currentJob, levelPay(currentJob, current.level, current.payAdjustment));
      const offerPay = toNaira(job, levelPay(job, 0));
      if (offerPay < currentPay) {
        await this.close(ctx, application, 'declined', `${job.employer} offered you the job, but it pays less than your current one — you politely declined.`);
        return;
      }
    }

    await this.close(ctx, application, 'accepted', `Offer accepted: ${titleOf(job, 0)}.`, false);
    await this.employment.hire(ctx, job);
  }

  private async close(
    ctx: SimulationContext,
    application: JobApplicationEntity,
    status: 'accepted' | 'rejected' | 'declined',
    message: string,
    notify = true,
  ): Promise<void> {
    application.status = status;
    application.message = message;
    await this.store.saveApplication(ctx, application);
    if (!notify) return;
    const job = findJob(application.jobId);
    ctx.notify({
      kind: 'career',
      title: status === 'rejected' ? `${job?.employer ?? 'Employer'} replied` : `Offer from ${job?.employer ?? 'an employer'}`,
      body: message,
      tone: status === 'rejected' ? 'bad' : 'neutral',
    });
  }
}
