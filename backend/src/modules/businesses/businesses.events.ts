import { MINUTES_PER_DAY, findBusinessType, formatNaira, type BusinessTypeDefinition } from '@insidelife/shared';
import type { LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { BusinessesStore } from './businesses.store.js';
import type { BusinessEntity } from './entities/business.entity.js';

export interface BusinessEventDeps {
  readonly store: BusinessesStore;
}

interface Owned {
  readonly business: BusinessEntity;
  readonly type: BusinessTypeDefinition;
}

/** One business gets at most one card in this many game days, whatever the card. */
const BUSINESS_EVENT_GAP_DAYS = 20;
/** This month's event effects on revenue stay within this band. */
const EVENT_MODIFIER_BOUNDS = { min: 0.5, max: 1.6 } as const;
const STREET_FACING = new Set(['pos-kiosk', 'provision-store', 'buka', 'salon', 'fashion-label']);
const MOTOR_PARK = new Set(['danfo-transport', 'dispatch-logistics', 'pos-kiosk']);
const CONSUMER = new Set(['retail', 'food', 'services', 'creative']);

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const roundTo = (value: number, step: number): number => Math.max(step, Math.round(value / step) * step);
const text = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const amount = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);
const cantAfford = (ctx: SimulationContext, cost: number): string | null => (ctx.wallet.canAfford(cost) ? null : `You need ${formatNaira(cost)} for this`);

/** Monthly fixed overhead of the business (fees and levies scale with its size). */
function overhead(owned: Owned | null): number {
  return owned ? owned.type.costs.fixedMonthly * owned.business.units : 100_000;
}

/** Params every business card carries: a deterministic reference (for idempotency keys) and the business. */
function baseParams(ctx: SimulationContext, owned: Owned | null): Record<string, string | number> {
  return { ref: ctx.time, businessId: owned?.business.id ?? '', name: owned?.business.name ?? 'your business' };
}

/** Business life-event cards: task force, agberos, theft, generator wahala and the occasional viral moment. */
export function businessEvents({ store }: BusinessEventDeps): LifeEventDefinition[] {
  async function candidates(ctx: SimulationContext, filter: (type: BusinessTypeDefinition) => boolean): Promise<Owned[]> {
    const owned: Owned[] = [];
    for (const business of await store.active(ctx)) {
      const type = findBusinessType(business.typeId);
      const rested = business.lastEventAt === null || ctx.time - business.lastEventAt >= BUSINESS_EVENT_GAP_DAYS * MINUTES_PER_DAY;
      if (type && rested && filter(type)) owned.push({ business, type });
    }
    return owned;
  }

  async function pick(ctx: SimulationContext, eventId: string, filter: (type: BusinessTypeDefinition) => boolean): Promise<Owned | null> {
    const list = await candidates(ctx, filter);
    if (list.length === 0) return null;
    const owned = ctx.rng(eventId, ctx.time).pick(list);
    owned.business.lastEventAt = ctx.time;
    await store.save(ctx, owned.business);
    return owned;
  }

  /** Run `work` against the business named in the card, if it's still trading. */
  async function withBusiness(ctx: SimulationContext, params: LifeEventParams, work: (owned: Owned) => Promise<LifeEventOutcome>): Promise<LifeEventOutcome> {
    const business = (await store.active(ctx)).find((candidate) => candidate.id === text(params, 'businessId'));
    const type = business ? findBusinessType(business.typeId) : undefined;
    if (!business || !type) return { title: 'Moot point', body: 'That business is no longer trading.', tone: 'neutral' };
    return work({ business, type });
  }

  async function shake(ctx: SimulationContext, { business }: Owned, revenueFactor: number, extraCosts = 0): Promise<void> {
    business.eventModifier = clamp(business.eventModifier * revenueFactor, EVENT_MODIFIER_BOUNDS.min, EVENT_MODIFIER_BOUNDS.max);
    business.eventCosts = Math.max(0, business.eventCosts + Math.round(extraCosts));
    await store.save(ctx, business);
  }

  const taskForce: LifeEventDefinition = {
    id: 'lasg-task-force',
    domain: 'businesses',
    art: '🚨',
    weight: 3,
    cooldownDays: 45,
    eligible: async (ctx) => (await candidates(ctx, (type) => STREET_FACING.has(type.id))).length > 0,
    prepare: async (ctx) => {
      const owned = await pick(ctx, 'lasg-task-force', (type) => STREET_FACING.has(type.id));
      return { ...baseParams(ctx, owned), fee: ctx.world.price(roundTo(overhead(owned) * ctx.rng('task-force-fee', ctx.time).float(0.1, 0.3), 1_000), ctx.time) };
    },
    title: () => 'LASG task force at your shop',
    body: (p) => `A Lagos State task force van screeched up outside ${text(p, 'name')}. “Illegal attachment! Where is your permit?” They want ${formatNaira(amount(p, 'fee'))} to “settle”.`,
    choices: [
      {
        id: 'settle',
        label: (p) => `Settle them (${formatNaira(amount(p, 'fee'))})`,
        unavailable: (ctx, p) => cantAfford(ctx, amount(p, 'fee')),
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async ({ business }) => {
            await ctx.wallet.pay(amount(p, 'fee'), 'fine', `Task force “settlement” — ${business.name}`, `task-force:${business.id}:${amount(p, 'ref')}`);
            return { title: 'Settled', body: 'They took the money and left. Business continues.', tone: 'neutral', moneyDelta: -amount(p, 'fee') };
          }),
      },
      {
        id: 'argue',
        label: () => 'Show your papers and argue',
        hint: () => 'Connections help',
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            if (ctx.rng('task-force-argue', amount(p, 'ref')).chance(0.2 + ctx.character.connections / 100)) {
              return { title: 'They backed down', body: 'One call to someone who knows someone. The van drove off.', tone: 'good' };
            }
            await shake(ctx, owned, 0.8, amount(p, 'fee') * 1.5);
            return { title: 'Goods seized', body: 'They carried your stock into the van. Sales will suffer this month.', tone: 'bad' };
          }),
      },
      {
        id: 'shut',
        label: () => 'Lock up for the day and hide',
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            await shake(ctx, owned, 0.92);
            return { title: 'Closed for the day', body: 'You lost a day of sales, but kept your stock.', tone: 'neutral' };
          }),
      },
    ],
    defaultChoiceId: 'shut',
  };

  const agberoLevy: LifeEventDefinition = {
    id: 'agbero-levy',
    domain: 'businesses',
    art: '🧾',
    weight: 3,
    cooldownDays: 40,
    eligible: async (ctx) => (await candidates(ctx, (type) => MOTOR_PARK.has(type.id))).length > 0,
    prepare: async (ctx) => {
      const owned = await pick(ctx, 'agbero-levy', (type) => MOTOR_PARK.has(type.id));
      return { ...baseParams(ctx, owned), fee: ctx.world.price(roundTo(overhead(owned) * ctx.rng('agbero-fee', ctx.time).float(0.05, 0.15), 1_000), ctx.time) };
    },
    title: () => 'Agberos want their levy',
    body: (p) => `“Owner, una never pay for this month!” The park boys are blocking ${text(p, 'name')} until you pay ${formatNaira(amount(p, 'fee'))}.`,
    choices: [
      {
        id: 'pay',
        label: (p) => `Pay the levy (${formatNaira(amount(p, 'fee'))})`,
        unavailable: (ctx, p) => cantAfford(ctx, amount(p, 'fee')),
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async ({ business }) => {
            await ctx.wallet.pay(amount(p, 'fee'), 'fee', `Union levy — ${business.name}`, `agbero:${business.id}:${amount(p, 'ref')}`);
            return { title: 'Levy paid', body: '“Owner, you too much!” Business continues.', tone: 'neutral', moneyDelta: -amount(p, 'fee') };
          }),
      },
      {
        id: 'refuse',
        label: () => 'Refuse — you’ve already paid the union',
        hint: () => 'Risky',
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            if (ctx.rng('agbero-refuse', amount(p, 'ref')).chance(0.5)) {
              await shake(ctx, owned, 0.95, amount(p, 'fee') * 1.5);
              return { title: 'They vandalised it', body: 'Broken windscreen, slashed tyres. Repairs will cost you this month.', tone: 'bad' };
            }
            return { title: 'They backed off', body: 'You stood your ground and the chairman waved them away.', tone: 'good' };
          }),
      },
    ],
    defaultChoiceId: 'pay',
  };

  const staffTheft: LifeEventDefinition = {
    id: 'staff-theft',
    domain: 'businesses',
    art: '🕵🏾',
    weight: 3,
    cooldownDays: 60,
    eligible: async (ctx) => (await candidates(ctx, () => true)).length > 0,
    prepare: async (ctx) => {
      const owned = await pick(ctx, 'staff-theft', () => true);
      const rng = ctx.rng('staff-theft-amount', ctx.time);
      const scale = owned ? owned.type.revenue.median * owned.business.units ** 0.9 : 100_000;
      return {
        ...baseParams(ctx, owned),
        stolen: roundTo(scale * rng.float(0.04, 0.12), 1_000),
        cctv: ctx.world.price(150_000, ctx.time),
        police: ctx.world.price(30_000, ctx.time),
      };
    },
    title: (p) => `Someone is stealing from ${text(p, 'name')}`,
    body: (p) => `The numbers don’t add up — ${formatNaira(amount(p, 'stolen'))} has walked out of ${text(p, 'name')}. Your staff all have “no idea”.`,
    choices: [
      {
        id: 'sack',
        label: () => 'Sack the main suspect',
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            await shake(ctx, owned, 0.95, amount(p, 'stolen'));
            return { title: 'Suspect sacked', body: 'You’re short-staffed for a while, and the money is gone.', tone: 'bad' };
          }),
      },
      {
        id: 'cctv',
        label: (p) => `Install CCTV (${formatNaira(amount(p, 'cctv'))})`,
        hint: () => 'Recovers some of it',
        unavailable: (ctx, p) => cantAfford(ctx, amount(p, 'cctv')),
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            await ctx.wallet.pay(amount(p, 'cctv'), 'purchase', `CCTV for ${owned.business.name}`, `cctv:${owned.business.id}:${amount(p, 'ref')}`);
            await shake(ctx, owned, 1, amount(p, 'stolen') / 2);
            return { title: 'Caught on camera', body: 'The footage shamed the thief into paying back half.', tone: 'neutral', moneyDelta: -amount(p, 'cctv') };
          }),
      },
      {
        id: 'police',
        label: (p) => `Report to the police (${formatNaira(amount(p, 'police'))} “mobilisation”)`,
        hint: () => 'Long shot',
        unavailable: (ctx, p) => cantAfford(ctx, amount(p, 'police')),
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            await ctx.wallet.pay(amount(p, 'police'), 'fee', 'Police “mobilisation”', `police:${owned.business.id}:${amount(p, 'ref')}`);
            if (ctx.rng('staff-theft-police', amount(p, 'ref')).chance(0.35)) {
              return { title: 'Money recovered', body: 'The police actually found the thief. Wonders!', tone: 'good', moneyDelta: -amount(p, 'police') };
            }
            await shake(ctx, owned, 1, amount(p, 'stolen'));
            return { title: '“Investigation ongoing”', body: 'You paid for fuel for their van. Nothing came of it.', tone: 'bad', moneyDelta: -amount(p, 'police') };
          }),
      },
    ],
    defaultChoiceId: 'sack',
  };

  const generator: LifeEventDefinition = {
    id: 'generator-breakdown',
    domain: 'businesses',
    art: '🔌',
    weight: 3,
    cooldownDays: 45,
    eligible: async (ctx) => (await candidates(ctx, (type) => type.costs.fuelShare >= 0.15)).length > 0,
    prepare: async (ctx) => {
      const owned = await pick(ctx, 'generator-breakdown', (type) => type.costs.fuelShare >= 0.15);
      const scale = owned ? Math.sqrt(owned.type.costs.fixedMonthly / 300_000) : 1;
      return { ...baseParams(ctx, owned), repair: ctx.world.price(roundTo(ctx.rng('generator-repair', ctx.time).int(80, 350) * 1_000 * scale, 1_000), ctx.time) };
    },
    title: () => 'Generator don pack up',
    body: (p) => `The big generator at ${text(p, 'name')} coughed, smoked and died. NEPA has given you two hours of light this week.`,
    choices: [
      {
        id: 'fix',
        label: (p) => `Call the mechanic (${formatNaira(amount(p, 'repair'))})`,
        unavailable: (ctx, p) => cantAfford(ctx, amount(p, 'repair')),
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async ({ business }) => {
            await ctx.wallet.pay(amount(p, 'repair'), 'purchase', `Generator repair — ${business.name}`, `generator:${business.id}:${amount(p, 'ref')}`);
            return { title: 'Back in business', body: 'New coil, new plug, same old noise.', tone: 'neutral', moneyDelta: -amount(p, 'repair') };
          }),
      },
      {
        id: 'manage',
        label: () => 'Manage with NEPA for now',
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            await shake(ctx, owned, 0.85);
            return { title: 'Managing', body: 'Customers left when the lights went off. Sales are down this month.', tone: 'bad' };
          }),
      },
    ],
    defaultChoiceId: 'manage',
  };

  const viralReview: LifeEventDefinition = {
    id: 'viral-review',
    domain: 'businesses',
    art: '📱',
    weight: 2,
    cooldownDays: 60,
    eligible: async (ctx) => (await candidates(ctx, (type) => CONSUMER.has(type.category))).length > 0,
    prepare: async (ctx) => {
      const owned = await pick(ctx, 'viral-review', (type) => CONSUMER.has(type.category));
      const ads = owned ? Math.max(20_000, roundTo(owned.type.costs.fixedMonthly * 0.3, 1_000)) : 20_000;
      return { ...baseParams(ctx, owned), ads: ctx.world.price(ads, ctx.time) };
    },
    title: (p) => `${text(p, 'name')} went viral on TikTok!`,
    body: (p) => `A food-and-lifestyle influencer posted a glowing review of ${text(p, 'name')}. Two million views and counting.`,
    choices: [
      {
        id: 'ads',
        label: (p) => `Ride the wave with paid ads (${formatNaira(amount(p, 'ads'))})`,
        unavailable: (ctx, p) => cantAfford(ctx, amount(p, 'ads')),
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            await ctx.wallet.pay(amount(p, 'ads'), 'purchase', `Social media ads — ${owned.business.name}`, `viral-ads:${owned.business.id}:${amount(p, 'ref')}`);
            await shake(ctx, owned, 1.35);
            return { title: 'Customers everywhere', body: 'The queue stretched down the street all month.', tone: 'good', moneyDelta: -amount(p, 'ads') };
          }),
      },
      {
        id: 'enjoy',
        label: () => 'Enjoy the free buzz',
        resolve: (ctx, p) =>
          withBusiness(ctx, p, async (owned) => {
            await shake(ctx, owned, 1.2);
            return { title: 'Free marketing', body: 'Sales are up this month. Thank you, internet.', tone: 'good' };
          }),
      },
    ],
    defaultChoiceId: 'enjoy',
  };

  return [taskForce, agberoLevy, staffTheft, generator, viralReview];
}
