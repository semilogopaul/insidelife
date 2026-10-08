import { Inject, Injectable } from '@nestjs/common';
import { MINUTES_PER_DAY, MINUTES_PER_YEAR, formatNaira, jobCertificationLabel, type JobDefinition } from '@insidelife/shared';
import { CREDENTIALS_PORT, type CredentialsPort } from '../../common/ports/credentials.port.js';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { employerOf, titleOf } from './career.presenter.js';
import { CareerStore } from './career.store.js';
import type { EmploymentEntity } from './entities/employment.entity.js';
import { EmploymentService } from './employment.service.js';
import { levelPay } from './rules/payroll.js';
import { promotionOutlook, type PromotionOutlook } from './rules/promotion.js';
import { missingLabels } from './rules/requirements.js';

export type PromotionRoute = 'review' | 'breakout' | 'headhunt';

export interface PromotionDecision {
  readonly promoted: boolean;
  readonly title: string;
  readonly message: string;
}

/** Promotion reviews, breakouts, entry licences (housemanship → MDCN) and "you're due" nudges. */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly store: CareerStore,
    private readonly profiles: CandidateProfileService,
    private readonly employment: EmploymentService,
    @Inject(CREDENTIALS_PORT) private readonly credentials: CredentialsPort,
  ) {}

  async outlook(ctx: SimulationContext, employment: EmploymentEntity, job: JobDefinition): Promise<PromotionOutlook> {
    return promotionOutlook(job, employment, await this.profiles.build(ctx), ctx.time);
  }

  /** The player asks the boss for a promotion. Decided on the spot, seeded per attempt (no re-rolls). */
  async request(ctx: SimulationContext): Promise<PromotionDecision> {
    const employment = await this.employment.requireActive(ctx);
    const job = this.employment.requireJob(employment);
    if (employment.startedAt > ctx.time) throw new GameRuleException('NOT_STARTED', 'You haven’t even resumed yet. Calm down small');

    const outlook = await this.outlook(ctx, employment, job);
    if (!outlook.next) throw new GameRuleException('TOP_OF_LADDER', 'You’re already at the top of this ladder. Oga at the top!');
    if (outlook.blockedReason) {
      const missing = missingLabels(outlook.gates);
      const detail = missing.length > 0 && !outlook.breakout ? ` (missing: ${missing.join(', ')})` : '';
      throw new GameRuleException('PROMOTION_NOT_READY', `${outlook.blockedReason}${detail}`);
    }

    const roll = ctx.rng('promotion', employment.id, employment.level, employment.promotionAttempts).next();
    if (roll < outlook.chance) {
      await this.promote(ctx, employment, job, 'review');
      return { promoted: true, title: outlook.next.title, message: `Congratulations! You’re now ${outlook.next.title}. Drinks are on you.` };
    }

    employment.promotionAttempts += 1;
    employment.lastPromotionRequestAt = ctx.time;
    await this.store.save(ctx, employment);
    return {
      promoted: false,
      title: titleOf(job, employment.level),
      message: 'Your oga said: “Not this cycle. Keep pushing.” Try again after the next appraisal (30 days).',
    };
  }

  /** Move up one level (review, breakout event or headhunter). */
  async promote(ctx: SimulationContext, employment: EmploymentEntity, job: JobDefinition, route: PromotionRoute): Promise<void> {
    const next = job.levels[employment.level + 1];
    if (!next) return;
    employment.level += 1;
    employment.levelStartedAt = ctx.time;
    employment.promotionAttempts = 0;
    employment.lastPromotionRequestAt = null;
    employment.performance = Math.max(employment.performance, 0.65);
    await this.store.save(ctx, employment);
    this.employment.refreshRoutine(ctx);

    const pay = levelPay(job, employment.level, employment.payAdjustment);
    const payLabel = job.currency === 'USD' ? `$${Math.round(pay).toLocaleString('en-US')}` : formatNaira(pay);
    const headline = route === 'breakout' ? 'Your time don reach! 🚀' : route === 'headhunt' ? 'New job, new title 💼' : 'Promotion! 🎉';
    ctx.notify({
      kind: 'career',
      title: headline,
      body: `You’re now ${next.title} at ${employerOf(job, employment)} — ${payLabel} a month.`,
      tone: 'good',
    });
    ctx.report({ label: `Promoted to ${next.title}`, tone: 'good' });
    const character = ctx.character;
    character.moodModifiers = [
      ...character.moodModifiers.filter((modifier) => modifier.id !== 'promoted'),
      { id: 'promoted', label: 'Just got promoted', value: 15, until: ctx.time + 5 * MINUTES_PER_DAY },
    ];
    character.connections = Math.min(100, character.connections + 2);
  }

  /** Day-end checks: grant the entry licence once earned, nudge when a promotion review is due. */
  async daily(ctx: SimulationContext, employment: EmploymentEntity, job: JobDefinition): Promise<void> {
    if (job.licence && !employment.licenceGranted && ctx.time - employment.startedAt >= job.licence.afterYears * MINUTES_PER_YEAR) {
      await this.credentials.grantCertification(ctx, job.licence.certification);
      this.profiles.forgetCredentials(ctx);
      employment.licenceGranted = true;
      ctx.notify({
        kind: 'career',
        title: 'Licence granted 🎓',
        body: `You completed your ${titleOf(job, 0).toLowerCase()} year — ${jobCertificationLabel(job.licence.certification)} is yours.`,
        tone: 'good',
      });
      await this.store.save(ctx, employment);
    }

    if (employment.promotionNotifiedLevel === employment.level) return;
    const outlook = await this.outlook(ctx, employment, job);
    if (!outlook.next || outlook.blockedReason) return;
    employment.promotionNotifiedLevel = employment.level;
    await this.store.save(ctx, employment);
    ctx.notify({
      kind: 'career',
      title: 'You’re due for promotion',
      body: `You’ve done your time as ${titleOf(job, employment.level)}. Ask for the ${outlook.next.title} role in the Jobs app.`,
      tone: 'good',
    });
  }
}
