import { Injectable } from '@nestjs/common';
import { MINUTES_PER_HOUR, formatNaira, moodPerformanceMultiplier, type ActionDefinition } from '@insidelife/shared';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { FREELANCE_GHOST_CHANCE, freelancePay } from './rules/freelance.js';

const CLIENTS = ['a boutique in Lekki', 'a church in Surulere', 'a logistics startup in Yaba', 'an aunty’s catering business', 'a client in Abuja', 'a real estate firm in Ajah'] as const;

/** The `freelance` action hook: pays naira per hour scaled by tech skill. */
@Injectable()
export class FreelanceService {
  constructor(private readonly engine: SimulationEngine) {}

  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (!action.hooks?.includes('freelance')) return;
    const rng = ctx.rng('freelance', activity.startedAt);
    const client = rng.pick(CLIENTS);
    if (rng.chance(FREELANCE_GHOST_CHANCE)) {
      ctx.notify({ kind: 'career', title: 'Client don ghost you 👻', body: `You finished the work for ${client}, but they’ve stopped picking your calls.`, tone: 'bad' });
      return;
    }
    const hours = (activity.endsAt - activity.startedAt) / MINUTES_PER_HOUR;
    const amount = freelancePay(ctx.character.skills.tech, hours, moodPerformanceMultiplier(this.engine.mood(ctx)), rng.float(0.75, 1.25));
    if (amount <= 0) return;
    await ctx.wallet.receive(amount, 'hustle', `Freelance gig for ${client}`, `freelance:${activity.startedAt}`, { income: 'earned' });
    ctx.notify({ kind: 'money-received', title: 'Freelance payment', body: `${formatNaira(amount)} from ${client}. “Thanks boss, the site is working now!”`, tone: 'good', amount });
  }
}
