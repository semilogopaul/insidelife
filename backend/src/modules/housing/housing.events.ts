import {
  BACKGROUNDS,
  DISTRICTS,
  LAND_TITLES,
  MINUTES_PER_DAY,
  formatDate,
  formatNaira,
  marketRent,
  roundRent,
  type BackgroundId,
  type DistrictId,
} from '@insidelife/shared';
import type { InventoryPort } from '../../common/ports/inventory.port.js';
import type { LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { ConstructionService } from './construction.service.js';
import type { HomeService } from './home.service.js';
import { days, increasedRent, nextTitle } from './housing.rules.js';
import type { HousingStore } from './housing.store.js';
import type { LandService } from './land.service.js';
import type { PowerService } from './power.service.js';
import type { RentalsService } from './rentals.service.js';

export interface HousingEventDeps {
  readonly store: HousingStore;
  readonly homes: HomeService;
  readonly power: PowerService;
  readonly rentals: RentalsService;
  readonly land: LandService;
  readonly construction: ConstructionService;
  readonly inventory: InventoryPort;
}

const DOMAIN = 'housing';
/** Params for a card whose subject vanished between eligibility and preparation (never shown in practice). */
const NO_PARAMS: LifeEventParams = {};
const STALE: LifeEventOutcome = { title: 'Matter don pass', body: 'Things moved on before you could act.', tone: 'neutral' };

const num = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);
const str = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const day = (ctx: SimulationContext): number => Math.floor(ctx.time / MINUTES_PER_DAY);

function addMood(ctx: SimulationContext, id: string, label: string, value: number, durationDays: number): void {
  ctx.character.moodModifiers = [
    ...ctx.character.moodModifiers.filter((modifier) => modifier.id !== id),
    { id, label, value, until: ctx.time + durationDays * MINUTES_PER_DAY },
  ];
}

/** Charm check: base chance plus charisma, capped. */
function charm(ctx: SimulationContext, base: number, divisor: number, cap: number, ...key: ReadonlyArray<string | number>): boolean {
  return ctx.rng(...key).chance(Math.min(cap, base + ctx.character.skills.charisma / divisor));
}

const cannotAfford = (ctx: SimulationContext, amount: number): string | null =>
  ctx.wallet.canAfford(amount) ? null : `You need ${formatNaira(amount)} for this`;

function lossLine(loss: { readonly cash: number; readonly item: string | null }, tag: string): string {
  return `They took ${formatNaira(loss.cash)}${loss.item ? ` and your ${tag}` : ''}.`;
}

const FAMILY_CONTRIBUTION: Readonly<Record<BackgroundId, number>> = {
  'sapa-pikin': 20_000,
  'working-class': 50_000,
  ajebota: 150_000,
  'nepo-baby': 500_000,
};

const SCAM_DISTRICTS: readonly DistrictId[] = ['lekki', 'yaba', 'surulere', 'ikeja', 'ajah'];

/** Housing life-event cards: landlords, agents, omonile, LASG, floods, neighbours, LAWMA, thieves and parents. */
export function housingEvents(deps: HousingEventDeps): readonly LifeEventDefinition[] {
  const { store, homes, power, rentals, land, construction, inventory } = deps;

  const rentIncrease: LifeEventDefinition = {
    id: 'housing.rent-increase',
    domain: DOMAIN,
    art: '🧾',
    weight: 40,
    cooldownDays: 3,
    expiresIn: 2 * MINUTES_PER_DAY,
    eligible: async (ctx) => {
      const lease = await store.lease(ctx);
      return (
        lease !== null &&
        lease.status === 'active' &&
        lease.renewalDecidedFor === lease.endAt &&
        lease.pendingIncrease > 0 &&
        !lease.nonRenewing &&
        !lease.flags.increaseRaised
      );
    },
    prepare: async (ctx) => {
      const lease = await store.lease(ctx);
      if (!lease) return NO_PARAMS;
      await rentals.setFlags(ctx, lease, { increaseRaised: true });
      const pct = Math.round(lease.pendingIncrease * 100);
      return { leaseId: lease.id, label: lease.label, oldRent: lease.annualRent, newRent: increasedRent(lease.annualRent, lease.pendingIncrease), pct, endAt: lease.endAt };
    },
    title: () => 'Landlord don increase rent',
    body: (p) =>
      `Your landlord at ${str(p, 'label')} says rent goes from ${formatNaira(num(p, 'oldRent'))} to ${formatNaira(num(p, 'newRent'))} (+${num(p, 'pct')}%) at renewal on ${formatDate(num(p, 'endAt'))}. “Na the economy o.”`,
    choices: [
      {
        id: 'accept',
        label: () => 'Accept it',
        hint: (p) => `${formatNaira(num(p, 'newRent'))}/year`,
        resolve: async (_ctx, p) => ({ title: 'You accepted', body: `Rent renews at ${formatNaira(num(p, 'newRent'))}. Landlord dey happy.`, tone: 'neutral' }),
      },
      {
        id: 'beg',
        label: () => 'Beg him with your best Lagos charm',
        hint: () => 'Charisma helps',
        resolve: async (ctx, p) => {
          const lease = await rentals.openLease(ctx, str(p, 'leaseId'));
          if (!lease) return STALE;
          if (charm(ctx, 0.25, 200, 0.75, 'landlord-beg', lease.id, lease.endAt)) {
            await rentals.halveIncrease(ctx, lease);
            return { title: 'He softened', body: `“Because you’re a good tenant…” The increase is now ${Math.round(lease.pendingIncrease * 100)}%.`, tone: 'good' };
          }
          addMood(ctx, 'landlord-snub', 'Landlord snubbed you', -3, 2);
          return { title: 'He no gree', body: '“My brother, economy is hard for everybody.” The increase stands.', tone: 'bad' };
        },
      },
      {
        id: 'leave',
        label: () => 'Tell him you’ll pack out',
        hint: () => 'Find a new place before the lease ends',
        resolve: async (ctx, p) => {
          const lease = await rentals.openLease(ctx, str(p, 'leaseId'));
          if (!lease) return STALE;
          await rentals.giveNotice(ctx, lease, 'tenant');
          return {
            title: 'Notice given',
            body: `You leave on ${formatDate(lease.endAt)}. Find a new place in Homes, or it’s back to the family house.`,
            tone: 'neutral',
          };
        },
      },
    ],
    defaultChoiceId: 'accept',
  };

  const twoYearsUpfront: LifeEventDefinition = {
    id: 'housing.two-years-upfront',
    domain: DOMAIN,
    art: '💸',
    weight: 35,
    cooldownDays: 3,
    expiresIn: 2 * MINUTES_PER_DAY,
    eligible: async (ctx) => {
      const lease = await store.lease(ctx);
      return lease !== null && lease.status === 'active' && !lease.nonRenewing && lease.flags.twoYearsDemand === true && !lease.flags.twoYearsRaised;
    },
    prepare: async (ctx) => {
      const lease = await store.lease(ctx);
      if (!lease) return NO_PARAMS;
      await rentals.setFlags(ctx, lease, { twoYearsRaised: true });
      return { leaseId: lease.id, label: lease.label, total: (lease.annualRent + lease.serviceCharge) * 2, endAt: lease.endAt };
    },
    title: () => 'Landlord wants two years upfront',
    body: (p) =>
      `Your landlord at ${str(p, 'label')} says from ${formatDate(num(p, 'endAt'))} he only takes two years at once — ${formatNaira(num(p, 'total'))}. “I want to build in the village.”`,
    choices: [
      {
        id: 'pay2',
        label: () => 'Agree to two years at renewal',
        hint: (p) => `${formatNaira(num(p, 'total'))}, no increase`,
        resolve: async (ctx, p) => {
          const lease = await rentals.openLease(ctx, str(p, 'leaseId'));
          if (!lease) return STALE;
          await rentals.agreeTwoYears(ctx, lease);
          return { title: 'Deal', body: `He’s all smiles — no increase for two years. Make sure the money is there by ${formatDate(lease.endAt)}.`, tone: 'good' };
        },
      },
      {
        id: 'plead',
        label: () => 'Plead for one year',
        hint: () => 'Charisma helps',
        resolve: async (ctx, p) => {
          const lease = await rentals.openLease(ctx, str(p, 'leaseId'));
          if (!lease) return STALE;
          if (charm(ctx, 0.4, 250, 0.8, 'two-years-plead', lease.id, lease.endAt)) {
            await rentals.dropTwoYearsDemand(ctx, lease);
            return { title: 'One year it is', body: 'He grumbled, but agreed to one more year.', tone: 'good' };
          }
          await rentals.giveNotice(ctx, lease, 'landlord');
          return { title: 'Quit notice', body: `“Then find another house.” You must pack out by ${formatDate(lease.endAt)}.`, tone: 'bad' };
        },
      },
      {
        id: 'leave',
        label: () => 'Pack out at the end of the lease',
        resolve: async (ctx, p) => {
          const lease = await rentals.openLease(ctx, str(p, 'leaseId'));
          if (!lease) return STALE;
          await rentals.giveNotice(ctx, lease, 'tenant');
          return { title: 'Notice given', body: `You leave on ${formatDate(lease.endAt)}. Start house hunting.`, tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'plead',
  };

  const agentScam: LifeEventDefinition = {
    id: 'housing.agent-scam',
    domain: DOMAIN,
    art: '🕵️',
    weight: 5,
    cooldownDays: 45,
    eligible: async (ctx) => {
      if (ctx.age < 18 || !ctx.wallet.canAfford(20_000)) return false;
      const residence = await store.residence(ctx);
      if (residence.kind === 'family') return true;
      const lease = await store.lease(ctx);
      return lease !== null && (lease.nonRenewing || lease.endAt - ctx.time <= days(60));
    },
    prepare: (ctx) => {
      const rng = ctx.rng('agent-pitch', day(ctx));
      const districtId = rng.pick(SCAM_DISTRICTS);
      return {
        district: DISTRICTS[districtId].name,
        rent: roundRent(marketRent(districtId, 'mini-flat') * 0.55),
        fee: rng.pick([15_000, 20_000, 25_000, 30_000]),
        firedAt: ctx.time,
      };
    },
    title: () => 'An agent with a sweet deal',
    body: (p) =>
      `An agent on WhatsApp has a “neat mini flat” in ${str(p, 'district')} for just ${formatNaira(num(p, 'rent'))}/year — way below market. He wants ${formatNaira(num(p, 'fee'))} inspection fee before he shows you.`,
    choices: [
      {
        id: 'pay',
        label: (p) => `Pay the ${formatNaira(num(p, 'fee'))} inspection fee`,
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'fee')),
        resolve: async (ctx, p) => {
          const fee = num(p, 'fee');
          await ctx.wallet.pay(fee, 'fee', 'Inspection fee to “agent”', `agent-scam:${num(p, 'firedAt')}`, { sink: 'fees' });
          if (ctx.rng('agent-scam-outcome', num(p, 'firedAt')).chance(0.65)) {
            return { title: 'The agent don japa!', body: 'His number is switched off and the address is a church. You have been scammed.', tone: 'bad', moneyDelta: -fee };
          }
          return { title: 'Shack by the canal', body: 'The “mini flat” was a converted kitchen beside a canal. You walked away poorer but wiser.', tone: 'bad', moneyDelta: -fee };
        },
      },
      {
        id: 'block',
        label: () => 'Too good to be true — block him',
        resolve: async (ctx) => {
          addMood(ctx, 'dodged-scam', 'Dodged a scam', 2, 1);
          return { title: 'Wisdom', body: 'Two days later his number was trending on X as a scammer. You laughed small.', tone: 'good' };
        },
      },
    ],
    defaultChoiceId: 'block',
  };

  const omonile: LifeEventDefinition = {
    id: 'housing.omonile-dispute',
    domain: DOMAIN,
    art: '🪓',
    weight: 50,
    cooldownDays: 1,
    expiresIn: 2 * MINUTES_PER_DAY,
    eligible: async (ctx) => (await store.heldProperties(ctx)).some((p) => p.dispute?.kind === 'omonile' && p.dispute.stage === 'open' && !p.dispute.raised),
    prepare: async (ctx) => {
      const property = (await store.heldProperties(ctx)).find((p) => p.dispute?.kind === 'omonile' && p.dispute.stage === 'open' && !p.dispute.raised);
      if (!property?.dispute) return NO_PARAMS;
      await land.markRaised(ctx, property);
      return {
        propertyId: property.id,
        label: property.label,
        district: DISTRICTS[property.districtId].name,
        demand: property.dispute.demand,
        legalFees: property.dispute.legalFees,
        winPct: Math.round(LAND_TITLES[property.title].courtWinChance * 100),
      };
    },
    title: () => 'Omonile on your land!',
    body: (p) =>
      `Some “land owners” mounted ${str(p, 'label')}, ${str(p, 'district')} with cutlasses and a signboard: “THIS LAND IS NOT FOR SALE”. They want ${formatNaira(num(p, 'demand'))} to “settle the family”.`,
    choices: [
      {
        id: 'settle',
        label: () => 'Pay them off',
        hint: (p) => formatNaira(num(p, 'demand')),
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'demand')),
        resolve: async (ctx, p) => {
          const property = await land.disputed(ctx, str(p, 'propertyId'), 'omonile');
          if (!property) return STALE;
          const paid = await land.settle(ctx, property);
          return { title: 'Settled', body: 'They collected the money, poured schnapps on the land and disappeared. For now.', tone: 'neutral', moneyDelta: -paid };
        },
      },
      {
        id: 'court',
        label: () => 'Take them to court',
        hint: (p) => `${formatNaira(num(p, 'legalFees'))} lawyer · ~${num(p, 'winPct')}% chance`,
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'legalFees')),
        resolve: async (ctx, p) => {
          const property = await land.disputed(ctx, str(p, 'propertyId'), 'omonile');
          if (!property) return STALE;
          if (!(await land.goToCourt(ctx, property))) return { title: 'No lawyer', body: 'You couldn’t pay a lawyer. The matter is still open.', tone: 'bad' };
          return { title: 'Case filed', body: 'Your lawyer filed at the Lagos High Court. Judgement in a few months — your papers will speak.', tone: 'neutral', moneyDelta: -num(p, 'legalFees') };
        },
      },
      {
        id: 'abandon',
        label: () => 'Abandon the land',
        hint: () => 'You lose the plot',
        resolve: async (ctx, p) => {
          const property = await land.disputed(ctx, str(p, 'propertyId'), 'omonile');
          if (!property) return STALE;
          await land.abandon(ctx, property, 'You walked away from the omonile — the land is theirs now.');
          return { title: 'Land gone', body: 'You walked away. Lesson learnt: check the title before you buy.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'court',
  };

  const demolition: LifeEventDefinition = {
    id: 'housing.demolition-notice',
    domain: DOMAIN,
    art: '🚜',
    weight: 50,
    cooldownDays: 1,
    expiresIn: 2 * MINUTES_PER_DAY,
    eligible: async (ctx) => (await store.heldProperties(ctx)).some((p) => p.dispute?.kind === 'demolition' && p.dispute.stage === 'open' && !p.dispute.raised),
    prepare: async (ctx) => {
      const property = (await store.heldProperties(ctx)).find((p) => p.dispute?.kind === 'demolition' && p.dispute.stage === 'open' && !p.dispute.raised);
      if (!property?.dispute) return NO_PARAMS;
      await land.markRaised(ctx, property);
      return {
        propertyId: property.id,
        label: property.label,
        titleLabel: LAND_TITLES[property.title].shortLabel,
        nextTitle: LAND_TITLES[nextTitle(property.title)].shortLabel,
        fee: property.dispute.demand,
        legalFees: property.dispute.legalFees,
        winPct: Math.round(LAND_TITLES[property.title].courtWinChance * 100),
      };
    },
    title: () => 'LASG marked your building “X”',
    body: (p) =>
      `Building Control painted a red X on your structure at ${str(p, 'label')}: “Contravention — remove within 7 days.” Your ${str(p, 'titleLabel')} papers don’t satisfy them.`,
    choices: [
      {
        id: 'regularise',
        label: () => 'Pay to regularise the papers',
        hint: (p) => `${formatNaira(num(p, 'fee'))} · title becomes ${str(p, 'nextTitle')}`,
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'fee')),
        resolve: async (ctx, p) => {
          const property = await land.disputed(ctx, str(p, 'propertyId'), 'demolition');
          if (!property) return STALE;
          const paid = await land.regularise(ctx, property);
          return { title: 'X painted over', body: `Your papers moved up to ${LAND_TITLES[property.title].label}. The bulldozers will find another street.`, tone: 'good', moneyDelta: -paid };
        },
      },
      {
        id: 'court',
        label: () => 'Go to court for an injunction',
        hint: (p) => `${formatNaira(num(p, 'legalFees'))} lawyer · ~${num(p, 'winPct')}% chance`,
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'legalFees')),
        resolve: async (ctx, p) => {
          const property = await land.disputed(ctx, str(p, 'propertyId'), 'demolition');
          if (!property) return STALE;
          if (!(await land.goToCourt(ctx, property))) return { title: 'No lawyer', body: 'You couldn’t pay a lawyer. The red X is still there.', tone: 'bad' };
          return { title: 'Injunction filed', body: 'The court told LASG to hold on until judgement. Pray.', tone: 'neutral', moneyDelta: -num(p, 'legalFees') };
        },
      },
      {
        id: 'ignore',
        label: () => 'Ignore them',
        hint: () => 'Risky',
        resolve: async (ctx, p) => {
          const property = await land.disputed(ctx, str(p, 'propertyId'), 'demolition');
          if (!property) return STALE;
          const demolished = await land.ignoreDemolition(ctx, property);
          return demolished
            ? { title: 'The bulldozers came', body: 'They came at 6am with police escort. The building is gone; the land is still yours.', tone: 'bad' }
            : { title: 'They never came back', body: 'Na wetin dem dey always talk. The X is fading in the rain.', tone: 'good' };
        },
      },
    ],
    defaultChoiceId: 'court',
  };

  const floodStreet: LifeEventDefinition = {
    id: 'housing.flood-street',
    domain: DOMAIN,
    art: '🌊',
    weight: 25,
    cooldownDays: 7,
    eligible: async (ctx) => {
      const residence = await store.residence(ctx);
      return residence.lastFloodDay !== null && day(ctx) - residence.lastFloodDay <= 1;
    },
    prepare: async (ctx) => {
      const home = await homes.current(ctx);
      return { district: DISTRICTS[home.districtId].name, cost: ctx.world.price(ctx.rng('flood-pump', day(ctx)).pick([10_000, 15_000, 25_000]), ctx.time), firedAt: ctx.time };
    },
    title: () => 'Flood for your street',
    body: (p) => `Heavy rain turned your street in ${str(p, 'district')} into a river. Water entered the house and your slippers are swimming to Epe.`,
    choices: [
      {
        id: 'pump',
        label: (p) => `Pay boys to pump and clean (${formatNaira(num(p, 'cost'))})`,
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'cost')),
        resolve: async (ctx, p) => {
          const cost = num(p, 'cost');
          await ctx.wallet.pay(cost, 'purchase', 'Flood clean-up', `flood-clean:${num(p, 'firedAt')}`);
          return { title: 'Dry again', body: 'The boys cleared the water. Your rug is gone but the house is dry.', tone: 'neutral', moneyDelta: -cost };
        },
      },
      {
        id: 'wade',
        label: () => 'Wade through and manage am',
        resolve: async (ctx) => {
          addMood(ctx, 'flood-wade', 'Wading through flood water', -8, 2);
          ctx.character.needs = { ...ctx.character.needs, hygiene: Math.min(ctx.character.needs.hygiene, 30) };
          return { title: 'Manage am', body: 'You rolled up your trousers and waded. Your legs will never be the same.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'wade',
  };

  const generatorNoise: LifeEventDefinition = {
    id: 'housing.generator-noise',
    domain: DOMAIN,
    art: '🔊',
    weight: 6,
    cooldownDays: 30,
    eligible: async (ctx) => {
      const home = await homes.current(ctx);
      return home.ownership !== 'owned' && power.gridHours(ctx, home.districtId, ctx.time) <= 14;
    },
    prepare: (ctx) => ({
      neighbour: ctx.rng('noisy-neighbour', day(ctx)).pick(['Baba Sikiru', 'Mr Chuks', 'Iya Basira', 'the pastor next door', 'the barber downstairs']),
      cost: ctx.world.price(8_000, ctx.time),
      firedAt: ctx.time,
    }),
    title: () => 'Neighbour’s generator is roaring',
    body: (p) => `${str(p, 'neighbour')} parked his “I-better-pass-my-neighbour” right under your window. It runs all night. Your walls are vibrating.`,
    choices: [
      {
        id: 'complain',
        label: () => 'Knock on his door and complain',
        hint: () => 'Charisma helps',
        resolve: async (ctx, p) => {
          if (charm(ctx, 0.35, 200, 0.8, 'generator-complain', num(p, 'firedAt'))) {
            return { title: 'He moved it', body: 'He grumbled, but moved the gen to the back. Sweet silence.', tone: 'good' };
          }
          addMood(ctx, 'generator-feud', 'Generator feud with neighbour', -3, 3);
          return { title: '“Na my right”', body: 'He said it’s his generator and turned it up. War has been declared.', tone: 'bad' };
        },
      },
      {
        id: 'earplugs',
        label: (p) => `Buy earplugs and a standing fan (${formatNaira(num(p, 'cost'))})`,
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'cost')),
        resolve: async (ctx, p) => {
          const cost = num(p, 'cost');
          await ctx.wallet.pay(cost, 'purchase', 'Earplugs and standing fan', `generator-earplugs:${num(p, 'firedAt')}`);
          return { title: 'Problem managed', body: 'Earplugs in, fan on. You can almost sleep.', tone: 'neutral', moneyDelta: -cost };
        },
      },
      {
        id: 'endure',
        label: () => 'Endure am',
        resolve: async (ctx) => {
          addMood(ctx, 'generator-noise', 'No sleep — generator noise', -6, 2);
          ctx.character.needs = { ...ctx.character.needs, energy: Math.max(0, ctx.character.needs.energy - 10) };
          return { title: 'Long night', body: 'You counted every cylinder of that engine until 5am.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'endure',
  };

  const lawma: LifeEventDefinition = {
    id: 'housing.lawma-levy',
    domain: DOMAIN,
    art: '🗑️',
    weight: 6,
    cooldownDays: 90,
    eligible: async (ctx) => (await store.residence(ctx)).kind !== 'family',
    prepare: async (ctx) => {
      const home = await homes.current(ctx);
      const levy = ctx.world.price(3_000 + DISTRICTS[home.districtId].prestige * 200, ctx.time);
      return { levy, fine: levy * 3, firedAt: ctx.time };
    },
    title: () => 'LAWMA collector at your gate',
    body: (p) => `A man in a LAWMA reflective vest wants ${formatNaira(num(p, 'levy'))} for waste collection. “Oga, na government money.”`,
    choices: [
      {
        id: 'pay',
        label: () => 'Pay the levy',
        hint: (p) => formatNaira(num(p, 'levy')),
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'levy')),
        resolve: async (ctx, p) => {
          const levy = num(p, 'levy');
          await ctx.wallet.pay(levy, 'tax', 'LAWMA waste levy', `lawma:${num(p, 'firedAt')}`, { sink: 'tax' });
          return { title: 'Receipt collected', body: 'Your bin will be emptied. Probably.', tone: 'neutral', moneyDelta: -levy };
        },
      },
      {
        id: 'dodge',
        label: () => 'Tell him you’re only visiting',
        hint: (p) => `Risk a ${formatNaira(num(p, 'fine'))} fine`,
        resolve: async (ctx, p) => {
          if (ctx.rng('lawma-dodge', num(p, 'firedAt')).chance(0.6)) return { title: 'He believed you', body: 'He moved to the next gate. Lagos survival skills.', tone: 'good' };
          const fine = num(p, 'fine');
          const paid = await ctx.wallet.tryPay(fine, 'fine', 'LAWMA mobile court fine', `lawma-fine:${num(p, 'firedAt')}`, { sink: 'tax' });
          if (paid) return { title: 'Mobile court!', body: `The mobile court caught up with you: ${formatNaira(fine)} fine.`, tone: 'bad', moneyDelta: -fine };
          addMood(ctx, 'gate-sealed', 'LAWMA sealed your gate', -5, 1);
          return { title: 'Gate sealed', body: 'You couldn’t pay the fine, so they sealed your gate for a day. Neighbours watched.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'pay',
  };

  const burglaryLoss = async (ctx: SimulationContext, p: LifeEventParams): Promise<{ readonly cash: number; readonly item: string | null }> => {
    const cash = Math.min(num(p, 'cashLoss'), ctx.wallet.cash);
    if (cash > 0) await ctx.wallet.pay(cash, 'adjustment', 'Cash stolen by burglars', `burglary:${num(p, 'firedAt')}`);
    const item = await inventory.takeByTag(ctx, str(p, 'tag'));
    return { cash, item };
  };

  const burglary: LifeEventDefinition = {
    id: 'housing.burglary',
    domain: DOMAIN,
    art: '🦹',
    weight: 5,
    cooldownDays: 60,
    eligible: async (ctx) => {
      const home = await homes.current(ctx);
      const residence = await store.residence(ctx);
      const crime = DISTRICTS[home.districtId].crimeRisk;
      if (crime < 0.3 || (residence.securityUntil !== null && residence.securityUntil > ctx.time)) return false;
      return ctx.rng('burglary-roll', day(ctx)).chance(crime);
    },
    prepare: async (ctx) => {
      const home = await homes.current(ctx);
      const rng = ctx.rng('burglary', day(ctx));
      const cap = 20_000 + DISTRICTS[home.districtId].prestige * 1_500;
      return {
        cashLoss: Math.max(1_000, Math.round(Math.min(ctx.wallet.cash * 0.03, cap) / 1_000) * 1_000),
        tag: rng.pick(['tv', 'laptop', 'phone']),
        policeFee: ctx.world.price(10_000, ctx.time),
        vigilanteFee: ctx.world.price(30_000, ctx.time),
        firedAt: ctx.time,
      };
    },
    title: () => 'Thieves visited your house',
    body: () => 'You came back to a broken burglary-proof. They carried the cash you hid under the mattress — and anything else they could lift.',
    choices: [
      {
        id: 'police',
        label: (p) => `Report at the station (${formatNaira(num(p, 'policeFee'))} “for stationery”)`,
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'policeFee')),
        resolve: async (ctx, p) => {
          const fee = num(p, 'policeFee');
          await ctx.wallet.pay(fee, 'fee', 'Police report “stationery”', `burglary-police:${num(p, 'firedAt')}`, { sink: 'fees' });
          const loss = await burglaryLoss(ctx, p);
          if (loss.cash > 0 && ctx.rng('burglary-recovery', num(p, 'firedAt')).chance(0.2)) {
            const recovered = Math.round(loss.cash / 2);
            await ctx.wallet.receive(recovered, 'refund', 'Stolen cash recovered by police', `burglary-recovered:${num(p, 'firedAt')}`, { income: 'neutral' });
            return { title: 'Small recovery', body: `${lossLine(loss, str(p, 'tag'))} The police actually caught one boy and recovered ${formatNaira(recovered)}!`, tone: 'neutral', moneyDelta: recovered - loss.cash - fee };
          }
          return { title: 'Statement taken', body: `${lossLine(loss, str(p, 'tag'))} The officer wrote your statement in a very old notebook.`, tone: 'bad', moneyDelta: -loss.cash - fee };
        },
      },
      {
        id: 'vigilante',
        label: (p) => `Pay the street vigilante (${formatNaira(num(p, 'vigilanteFee'))})`,
        hint: () => 'Safer for six months',
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'vigilanteFee')),
        resolve: async (ctx, p) => {
          const fee = num(p, 'vigilanteFee');
          await ctx.wallet.pay(fee, 'fee', 'Street vigilante levy', `burglary-vigilante:${num(p, 'firedAt')}`, { sink: 'fees' });
          const loss = await burglaryLoss(ctx, p);
          const residence = await store.residence(ctx);
          residence.securityUntil = ctx.time + days(180);
          await store.save(ctx, residence);
          return { title: 'Vigilante on duty', body: `${lossLine(loss, str(p, 'tag'))} The street boys now patrol with whistles and torchlights.`, tone: 'neutral', moneyDelta: -loss.cash - fee };
        },
      },
      {
        id: 'letgo',
        label: () => 'Count your losses',
        resolve: async (ctx, p) => {
          const loss = await burglaryLoss(ctx, p);
          addMood(ctx, 'burgled', 'Your house was burgled', -6, 3);
          return { title: 'E don happen', body: `${lossLine(loss, str(p, 'tag'))} You fixed the burglary-proof yourself.`, tone: 'bad', moneyDelta: -loss.cash };
        },
      },
    ],
    defaultChoiceId: 'letgo',
  };

  const parentsMoveOut: LifeEventDefinition = {
    id: 'housing.parents-move-out',
    domain: DOMAIN,
    art: '👨‍👩‍👧',
    weight: 10,
    cooldownDays: 60,
    eligible: async (ctx) => ctx.age >= 25 && (await store.residence(ctx)).kind === 'family',
    prepare: (ctx) => ({ contribution: ctx.world.price(FAMILY_CONTRIBUTION[ctx.character.background], ctx.time), background: BACKGROUNDS[ctx.character.background].label, firedAt: ctx.time }),
    title: () => '“When are you moving out?”',
    body: () => 'Daddy cleared his throat at dinner: “At your age I had my own house, a wife and two children.” Mummy nodded. Everybody looked at you.',
    choices: [
      {
        id: 'hunt',
        label: () => 'Promise to start house hunting',
        resolve: async (ctx) => {
          const residence = await store.residence(ctx);
          residence.familyHints += 1;
          await store.save(ctx, residence);
          return { title: 'Promise made', body: 'Homes → Listings. Mummy is watching your phone screen.', tone: 'neutral' };
        },
      },
      {
        id: 'contribute',
        label: (p) => `Contribute to the house (${formatNaira(num(p, 'contribution'))})`,
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'contribution')),
        resolve: async (ctx, p) => {
          const amount = num(p, 'contribution');
          await ctx.wallet.pay(amount, 'family-support', 'Contribution to the family house', `family-contribution:${num(p, 'firedAt')}`);
          return { title: 'Peace for now', body: 'Daddy grunted approvingly. The topic is closed — for a while.', tone: 'good', moneyDelta: -amount };
        },
      },
      {
        id: 'beg',
        label: () => 'Beg to stay small longer',
        resolve: async (ctx) => {
          addMood(ctx, 'family-pressure', 'Family pressure', -4, 3);
          return { title: 'Awkward', body: 'Your uncle called to remind you that at your age he had three children.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'beg',
  };

  const costOverrun: LifeEventDefinition = {
    id: 'housing.cost-overrun',
    domain: DOMAIN,
    art: '🧱',
    weight: 40,
    cooldownDays: 1,
    expiresIn: 2 * MINUTES_PER_DAY,
    eligible: async (ctx) => (await store.portfolio(ctx)).buildings.some((b) => b.status === 'under-construction' && b.overrun !== null && !b.overrun.raised),
    prepare: async (ctx) => {
      const building = (await store.portfolio(ctx)).buildings.find((b) => b.status === 'under-construction' && b.overrun !== null && !b.overrun.raised);
      const site = building ? await construction.withOverrun(ctx, building.id) : null;
      if (!site?.building.overrun) return NO_PARAMS;
      await construction.markOverrunRaised(ctx, site.building);
      return { buildingId: site.building.id, label: site.property.label, amount: site.building.overrun.amount };
    },
    title: () => 'Contractor: “Cement don go up”',
    body: (p) => `Your contractor at ${str(p, 'label')} says cement, rods and blocks have jumped. He needs ${formatNaira(num(p, 'amount'))} extra to continue.`,
    choices: [
      {
        id: 'pay',
        label: () => 'Pay the extra',
        hint: (p) => formatNaira(num(p, 'amount')),
        unavailable: (ctx, p) => cannotAfford(ctx, num(p, 'amount')),
        resolve: async (ctx, p) => {
          const site = await construction.withOverrun(ctx, str(p, 'buildingId'));
          if (!site) return STALE;
          const paid = await construction.payOverrun(ctx, site.property, site.building);
          return { title: 'Work continues', body: 'Money talks. The site is buzzing again.', tone: 'neutral', moneyDelta: -paid };
        },
      },
      {
        id: 'cheap',
        label: () => 'Tell him to manage with cheaper materials',
        hint: () => 'Weaker house',
        resolve: async (ctx, p) => {
          const site = await construction.withOverrun(ctx, str(p, 'buildingId'));
          if (!site) return STALE;
          await construction.useCheaperMaterials(ctx, site.building);
          return { title: '“Manage am”', body: 'Thinner rods, cheaper blocks. The house will stand… probably.', tone: 'bad' };
        },
      },
      {
        id: 'sack',
        label: () => 'Sack him and find another contractor',
        hint: () => 'About a month’s delay',
        resolve: async (ctx, p) => {
          const site = await construction.withOverrun(ctx, str(p, 'buildingId'));
          if (!site) return STALE;
          await construction.changeContractor(ctx, site.building);
          return { title: 'New contractor', body: 'You found a new contractor through your church. Work resumes after a month’s delay.', tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'cheap',
  };

  return [rentIncrease, twoYearsUpfront, agentScam, omonile, demolition, floodStreet, generatorNoise, lawma, burglary, parentsMoveOut, costOverrun];
}
