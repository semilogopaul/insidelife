import { Injectable } from '@nestjs/common';
import { MINUTES_PER_DAY, formatNaira } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { PonziStakeEntity } from './entities/ponzi-stake.entity.js';

/** "100% in 30 days." */
export const PONZI_PROMISED_MULTIPLE = 2;
export const PONZI_PAYOUT_DAYS = 30;
/** The scheme collapses between these many days after you join; only a late collapse lets you cash out first. */
const COLLAPSE_MIN_DAYS = 3;
const COLLAPSE_MAX_DAYS = 40;

const STAKES_MEMO = 'investments:ponzi';

/**
 * CBEX/MMM-style schemes from life events. Joining burns the stake (`system:burn`) — the money is gone the moment
 * it's sent, like the real thing. The fate is fixed at join time from the character's seed: the scheme collapses on a
 * deterministic day in [3, 40] after joining. If that's after the 30-day payout date (~26%), the player gets the
 * promised double (minted, unearned); otherwise they lose everything. Expected value ≈ −47%.
 */
@Injectable()
export class PonziService {
  active(ctx: SimulationContext): Promise<PonziStakeEntity[]> {
    return ctx.memo(STAKES_MEMO, () => ctx.manager.find(PonziStakeEntity, { where: { characterId: ctx.character.id, status: 'active' } }));
  }

  async hasActiveStake(ctx: SimulationContext): Promise<boolean> {
    return (await this.active(ctx)).length > 0;
  }

  async join(ctx: SimulationContext, scheme: string, amount: number, reference: string): Promise<PonziStakeEntity> {
    await ctx.wallet.pay(amount, 'investment', `${scheme} "investment"`, `ponzi:${reference}`, { sink: 'burn', metadata: { scheme } });
    const collapseDays = ctx.rng('ponzi-collapse', reference).int(COLLAPSE_MIN_DAYS, COLLAPSE_MAX_DAYS);
    const stake = await ctx.manager.save(
      ctx.manager.create(PonziStakeEntity, {
        characterId: ctx.character.id,
        scheme,
        amount,
        promisedPayout: amount * PONZI_PROMISED_MULTIPLE,
        joinedAt: ctx.time,
        payoutAt: ctx.time + PONZI_PAYOUT_DAYS * MINUTES_PER_DAY,
        collapseAt: ctx.time + collapseDays * MINUTES_PER_DAY,
        status: 'active',
        resolvedAt: null,
      }),
    );
    ctx.invalidate(STAKES_MEMO);
    return stake;
  }

  /** Simulation (day end): collapse or pay out according to the schedule fixed at join time. */
  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const stakes = await this.active(ctx);
    if (stakes.length === 0) return;
    const endOfDay = (dayIndex + 1) * MINUTES_PER_DAY;
    let changed = false;
    for (const stake of stakes) {
      // The memoised list outlives this day within a long settle; resolved stakes must not resolve again.
      if (stake.status !== 'active') continue;
      const collapsesFirst = stake.collapseAt <= stake.payoutAt;
      if (collapsesFirst && stake.collapseAt <= endOfDay) {
        stake.status = 'collapsed';
        stake.resolvedAt = stake.collapseAt;
        await ctx.manager.save(stake);
        changed = true;
        ctx.report({ label: `${stake.scheme} collapsed`, amount: -stake.amount, tone: 'bad' });
        ctx.notify({
          kind: 'investment',
          title: `${stake.scheme} don crash!`,
          body: `The SEC froze the platform and the founders are “unreachable”. Your ${formatNaira(stake.amount)} is gone.`,
          tone: 'bad',
          amount: -stake.amount,
        });
      } else if (!collapsesFirst && stake.payoutAt <= endOfDay) {
        await ctx.wallet.receive(stake.promisedPayout, 'investment', `${stake.scheme} payout`, `ponzi:${stake.id}:payout`, {
          income: 'unearned',
          metadata: { scheme: stake.scheme },
        });
        stake.status = 'paid';
        stake.resolvedAt = stake.payoutAt;
        await ctx.manager.save(stake);
        changed = true;
        ctx.report({ label: `${stake.scheme} actually paid`, amount: stake.promisedPayout, tone: 'good' });
        ctx.notify({
          kind: 'investment',
          title: `${stake.scheme} actually paid?!`,
          body: `${formatNaira(stake.promisedPayout)} landed. Somebody else's money, probably. It won't last — don't go back in.`,
          tone: 'good',
          amount: stake.promisedPayout,
        });
      }
    }
    if (changed) ctx.invalidate(STAKES_MEMO);
  }
}
