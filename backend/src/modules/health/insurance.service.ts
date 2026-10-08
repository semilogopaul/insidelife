import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import {
  HMO_PLANS,
  HMO_PLAN_IDS,
  HMO_WAITING_DAYS,
  MINUTES_PER_DAY,
  formatGameDuration,
  formatNaira,
  hmoMonthlyPremium,
  monthIndexOf,
  toDateParts,
  type CareFacilityType,
  type GameMinute,
  type HmoMembershipDto,
  type HmoPlanDto,
  type HmoPlanId,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HmoMembershipEntity } from './entities/hmo-membership.entity.js';
import { HEALTH_MEMO } from './health.constants.js';
import { MedicalHistoryService } from './medical-history.service.js';

export interface CoverQuote {
  readonly price: number;
  /** What the HMO pays. */
  readonly covered: number;
  /** What the character pays. */
  readonly youPay: number;
  readonly membershipId: string | null;
}

export interface CoverOptions {
  /** Maternity care: only covered if the plan was active (past its waiting period) before conception. */
  readonly maternityConceivedAt?: GameMinute;
}

/**
 * HMO plans: join (first month paid upfront, claims honoured after a waiting period), monthly premiums (lapse when
 * unpaid), coverage by facility tier with an annual limit, and maternity cover.
 */
@Injectable()
export class InsuranceService {
  constructor(private readonly history: MedicalHistoryService) {}

  /** The latest membership that hasn't been cancelled (active, or lapsed so the app can say so). */
  async membership(ctx: SimulationContext): Promise<HmoMembershipEntity | null> {
    return ctx.memo(HEALTH_MEMO.hmo, () =>
      ctx.manager.findOne(HmoMembershipEntity, {
        where: { characterId: ctx.character.id, status: In(['active', 'lapsed']) },
        order: { startedAt: 'DESC' },
      }),
    );
  }

  async active(ctx: SimulationContext): Promise<HmoMembershipEntity | null> {
    const membership = await this.membership(ctx);
    return membership?.status === 'active' ? membership : null;
  }

  /** Comprehensive and executive members get noticeably better long-term care. */
  async hasGoodCare(ctx: SimulationContext): Promise<boolean> {
    const membership = await this.active(ctx);
    return membership !== null && (membership.planId === 'comprehensive' || membership.planId === 'executive');
  }

  async join(ctx: SimulationContext, planId: HmoPlanId): Promise<HmoMembershipEntity> {
    const plan = HMO_PLANS[planId];
    const existing = await this.active(ctx);
    if (existing?.planId === planId) throw new GameRuleException('ALREADY_COVERED', `You’re already on the ${plan.label} plan`);

    const id = randomUUID();
    const premium = ctx.world.price(hmoMonthlyPremium(planId), ctx.time);
    await ctx.wallet.pay(premium, 'health', `HMO ${plan.label} plan — first month`, `hmo:${id}:join`, { metadata: { planId } });

    if (existing) {
      existing.status = 'cancelled';
      existing.endedAt = ctx.time;
      await ctx.manager.save(existing);
    }
    const coveredFrom = ctx.time + HMO_WAITING_DAYS * MINUTES_PER_DAY;
    const membership = await ctx.manager.save(
      ctx.manager.create(HmoMembershipEntity, {
        id,
        characterId: ctx.character.id,
        planId,
        status: 'active',
        startedAt: ctx.time,
        coveredFrom,
        paidThroughMonth: monthIndexOf(ctx.time),
        coverYear: toDateParts(ctx.time).year,
        coverUsed: 0,
        endedAt: null,
      }),
    );
    ctx.invalidate(HEALTH_MEMO.hmo);

    await this.history.record(ctx, {
      kind: 'insurance',
      summary: `${existing ? 'Switched to' : 'Joined'} the ${plan.label} HMO plan (${formatNaira(premium)}/month)`,
      cost: premium,
    });
    ctx.notify({
      kind: 'health',
      title: `HMO ${plan.label} plan active`,
      body: `First month paid (${formatNaira(premium)}). Cover starts in ${formatGameDuration(coveredFrom - ctx.time)} — hospitals won’t honour claims before then.`,
      tone: 'good',
      amount: -premium,
    });
    return membership;
  }

  async cancel(ctx: SimulationContext): Promise<void> {
    const membership = await this.membership(ctx);
    if (!membership) throw new GameRuleException('NO_HMO', 'You don’t have an HMO plan to cancel');
    membership.status = 'cancelled';
    membership.endedAt = ctx.time;
    await ctx.manager.save(membership);
    ctx.invalidate(HEALTH_MEMO.hmo);
    await this.history.record(ctx, { kind: 'insurance', summary: `Cancelled the ${HMO_PLANS[membership.planId].label} HMO plan` });
  }

  /** Split a bill between the HMO and the character. Never throws. */
  async cover(ctx: SimulationContext, facility: CareFacilityType, price: number, options: CoverOptions = {}): Promise<CoverQuote> {
    const membership = await this.active(ctx);
    if (!membership || ctx.time < membership.coveredFrom || price <= 0) return { price, covered: 0, youPay: price, membershipId: null };
    const plan = HMO_PLANS[membership.planId];
    const share =
      options.maternityConceivedAt === undefined
        ? plan.coverage[facility]
        : membership.coveredFrom <= options.maternityConceivedAt
          ? plan.maternity
          : 0;
    const remaining = Math.max(0, plan.annualLimit - this.usedThisYear(membership, ctx.time));
    const covered = Math.min(Math.round(price * share), remaining);
    return { price, covered, youPay: price - covered, membershipId: covered > 0 ? membership.id : null };
  }

  /** Record what the HMO paid against the annual limit. */
  async claim(ctx: SimulationContext, quote: CoverQuote): Promise<void> {
    if (quote.covered <= 0 || quote.membershipId === null) return;
    const membership = await this.active(ctx);
    if (!membership || membership.id !== quote.membershipId) return;
    const year = toDateParts(ctx.time).year;
    membership.coverUsed = (membership.coverYear === year ? membership.coverUsed : 0) + quote.covered;
    membership.coverYear = year;
    await ctx.manager.save(membership);
  }

  /** Bill next month's premium; an unpaid premium lapses the plan. */
  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const membership = await this.active(ctx);
    if (!membership) return;
    const month = monthIndex + 1;
    if (month <= membership.paidThroughMonth) return;
    const plan = HMO_PLANS[membership.planId];
    const premium = ctx.world.price(hmoMonthlyPremium(membership.planId), ctx.time);
    const paid = await ctx.wallet.tryPay(premium, 'health', `HMO premium (${plan.label})`, `hmo:${membership.id}:${month}`);
    if (paid) {
      membership.paidThroughMonth = month;
      await ctx.manager.save(membership);
      ctx.report({ label: `HMO premium (${plan.label})`, amount: -premium, tone: 'neutral' });
      return;
    }
    membership.status = 'lapsed';
    membership.endedAt = ctx.time;
    await ctx.manager.save(membership);
    ctx.invalidate(HEALTH_MEMO.hmo);
    ctx.notify({
      kind: 'health',
      title: 'Your HMO plan has lapsed',
      body: `You couldn’t pay the ${formatNaira(premium)} premium, so your ${plan.label} cover has stopped. Rejoin from the Health app when you can.`,
      tone: 'bad',
    });
    await this.history.record(ctx, { kind: 'insurance', summary: `${plan.label} HMO plan lapsed (premium unpaid)` });
  }

  async endOnDeath(ctx: SimulationContext): Promise<void> {
    const membership = await this.membership(ctx);
    if (!membership) return;
    membership.status = 'cancelled';
    membership.endedAt = ctx.time;
    await ctx.manager.save(membership);
    ctx.invalidate(HEALTH_MEMO.hmo);
  }

  planDtos(ctx: SimulationContext): HmoPlanDto[] {
    return HMO_PLAN_IDS.map((id) => {
      const plan = HMO_PLANS[id];
      return {
        id,
        label: plan.label,
        blurb: plan.blurb,
        annualPremium: ctx.world.price(plan.annualPremium, ctx.time),
        monthlyPremium: ctx.world.price(hmoMonthlyPremium(id), ctx.time),
        coverage: plan.coverage,
        annualLimit: plan.annualLimit,
        maternityCover: plan.maternity,
      };
    });
  }

  membershipDto(ctx: SimulationContext, membership: HmoMembershipEntity): HmoMembershipDto {
    const plan = HMO_PLANS[membership.planId];
    return {
      id: membership.id,
      planId: membership.planId,
      label: plan.label,
      status: membership.status,
      startedAt: membership.startedAt,
      coveredFrom: membership.coveredFrom,
      monthlyPremium: ctx.world.price(hmoMonthlyPremium(membership.planId), ctx.time),
      coverage: plan.coverage,
      annualLimit: plan.annualLimit,
      coverUsedThisYear: this.usedThisYear(membership, ctx.time),
    };
  }

  private usedThisYear(membership: HmoMembershipEntity, t: GameMinute): number {
    return membership.coverYear === toDateParts(t).year ? membership.coverUsed : 0;
  }
}
