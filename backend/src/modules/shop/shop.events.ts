import { FAULTY_CONDITION, MINUTES_PER_DAY, findItem, findProduct, formatNaira } from '@insidelife/shared';
import type { LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { InventoryService, OwnedStack } from './inventory.service.js';

const SNATCH_SPOTS = ['Ojuelegba', 'Oshodi', 'Obalende', 'CMS', 'Ikeja Along', 'Third Mainland Bridge'] as const;
const FLAGSHIP_PHONE = 'phone-iphone-17-pro-max';
const CLONE_PHONE = 'phone-iphone-clone';

const num = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);
const text = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const eventKey = (eventId: string, params: LifeEventParams, suffix: string): string => `event:${eventId}:${num(params, 'rolledAt')}:${suffix}`;

function addMood(ctx: SimulationContext, id: string, label: string, value: number, days: number): void {
  ctx.character.moodModifiers = [
    ...ctx.character.moodModifiers.filter((modifier) => modifier.id !== id),
    { id, label, value, until: ctx.time + days * MINUTES_PER_DAY },
  ];
}

function drainEnergy(ctx: SimulationContext, amount: number): void {
  ctx.character.needs = { ...ctx.character.needs, energy: Math.max(0, ctx.character.needs.energy - amount) };
}

function disconnect(ctx: SimulationContext): LifeEventOutcome {
  addMood(ctx, 'nepa-disconnected', 'NEPA cut your wire', -6, 7);
  return { title: 'They cut your wire', body: 'Two NEPA officials climbed the pole and disconnected your house. Darkness for the week.', tone: 'bad' };
}

/** Shop-domain life events: phone snatching, generator wahala, NEPA estimated billing and a "sealed" iPhone. */
export function shopLifeEvents(inventory: InventoryService): LifeEventDefinition[] {
  const workingGenerator = async (ctx: SimulationContext): Promise<OwnedStack | null> => {
    const generators = (await inventory.stacks(ctx)).filter(
      (stack) => stack.product.kind === 'item' && stack.product.def.tags.includes('generator') && inventory.condition(ctx, stack) >= FAULTY_CONDITION,
    );
    return generators.toSorted((a, b) => b.product.def.price - a.product.def.price)[0] ?? null;
  };

  const losePhone = async (ctx: SimulationContext, headline: string): Promise<LifeEventOutcome> => {
    const lost = await inventory.takeByTag(ctx, 'phone');
    addMood(ctx, 'phone-snatched', 'Phone snatched', -6, 3);
    const name = lost ? (findItem(lost)?.name ?? 'Your phone') : 'Your phone';
    return { title: headline, body: `${name} is gone for good. Computer Village is calling your name.`, tone: 'bad' };
  };

  const phoneSnatched: LifeEventDefinition = {
    id: 'phone-snatched',
    domain: 'shop',
    art: '📱',
    weight: 2,
    cooldownDays: 25,
    eligible: (ctx) => inventory.hasTag(ctx, 'phone'),
    prepare: (ctx) => ({ rolledAt: ctx.time, spot: ctx.rng('phone-snatch-spot', ctx.time).pick(SNATCH_SPOTS) }),
    title: () => 'Phone snatched in traffic!',
    body: (p) => `You were pressing your phone by the window in ${text(p, 'spot')} go-slow. A boy on okada just reached in and grabbed it!`,
    choices: [
      {
        id: 'chase',
        label: () => 'Jump down and chase him',
        hint: () => 'fitness helps',
        resolve: async (ctx, p) => {
          drainEnergy(ctx, 15);
          if (ctx.rng('phone-snatch', num(p, 'rolledAt'), 'chase').chance(0.15 + ctx.character.fitness / 250)) {
            addMood(ctx, 'caught-thief', 'Caught the phone thief', 5, 2);
            return { title: 'You caught him!', body: 'Area boys joined the chase and you got your phone back — plus a story for the group chat.', tone: 'good' };
          }
          return losePhone(ctx, 'He vanished under the bridge');
        },
      },
      {
        id: 'shout-ole',
        label: () => '“OLE! OLE!” — shout for the crowd',
        hint: () => 'risky',
        resolve: async (ctx, p) => {
          if (ctx.rng('phone-snatch', num(p, 'rolledAt'), 'ole').chance(0.35)) {
            return { title: 'The crowd caught him', body: 'Market women blocked his okada. You got your phone back and begged them to let him go.', tone: 'good' };
          }
          return losePhone(ctx, 'Nobody moved');
        },
      },
      {
        id: 'let-go',
        label: () => 'Let it go — e no worth your life',
        resolve: (ctx) => losePhone(ctx, 'You let it go'),
      },
    ],
    defaultChoiceId: 'let-go',
  };

  const generatorRepair: LifeEventDefinition = {
    id: 'generator-repair',
    domain: 'shop',
    art: '⛽',
    weight: 2,
    cooldownDays: 20,
    eligible: async (ctx) => (await workingGenerator(ctx)) !== null,
    prepare: async (ctx) => {
      const generator = await workingGenerator(ctx);
      const rng = ctx.rng('generator-repair', ctx.time);
      const big = (generator?.product.def.price ?? 0) > 1_000_000;
      return {
        rolledAt: ctx.time,
        stackId: generator?.row.id ?? '',
        name: generator?.product.def.name ?? 'generator',
        cost: ctx.world.price(big ? rng.int(15, 45) * 10_000 : rng.int(12, 35) * 1_000, ctx.time),
      };
    },
    title: () => 'Gen don pack up',
    body: (p) =>
      `Your ${text(p, 'name')} coughed, smoked and died in the middle of the night. The mechanic says "na plug and carburettor" — ${formatNaira(num(p, 'cost'))}.`,
    choices: [
      {
        id: 'mechanic',
        label: (p) => `Call the gen mechanic (${formatNaira(num(p, 'cost'))})`,
        unavailable: (ctx, p) => (ctx.wallet.canAfford(num(p, 'cost')) ? null : 'You can’t afford the mechanic right now'),
        resolve: async (ctx, p) => {
          const stack = (await inventory.stacks(ctx)).find(({ row }) => row.id === text(p, 'stackId'));
          if (!stack) return { title: 'Too late', body: 'You no longer have that generator.', tone: 'neutral' };
          const cost = num(p, 'cost');
          if (!(await ctx.wallet.tryPay(cost, 'purchase', `Generator repair: ${stack.product.def.name}`, eventKey('generator-repair', p, 'mechanic')))) {
            return { title: 'No money for the mechanic', body: 'The gen stays dead for now. Repair it from your inventory when you can.', tone: 'bad' };
          }
          await inventory.setCondition(ctx, stack.row, 95);
          return { title: 'Gen is roaring again', body: 'New plug, cleaned carburettor, and the mechanic "borrowed" your screwdriver.', tone: 'good', moneyDelta: -cost };
        },
      },
      {
        id: 'manage',
        label: () => 'Manage am — kick-start it with a stick',
        hint: () => 'it may get worse',
        resolve: async (ctx, p) => {
          const stack = (await inventory.stacks(ctx)).find(({ row }) => row.id === text(p, 'stackId'));
          if (stack) await inventory.setCondition(ctx, stack.row, inventory.condition(ctx, stack) - 35);
          return { title: 'It started… barely', body: 'It runs, but it sounds like a danfo going uphill. Get it repaired before it dies for good.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'manage',
  };

  const nepaBill: LifeEventDefinition = {
    id: 'nepa-estimated-bill',
    domain: 'shop',
    art: '🧾',
    weight: 2,
    cooldownDays: 30,
    eligible: () => true,
    prepare: async (ctx) => {
      const tags = new Set(await inventory.tags(ctx));
      const load =
        8_000 +
        (tags.has('ac') ? 18_000 : 0) +
        (tags.has('fridge') ? 6_000 : 0) +
        (tags.has('washing-machine') ? 5_000 : 0) +
        (tags.has('tv') ? 3_000 : 0) +
        (tags.has('console') ? 2_000 : 0);
      const estimated = Math.round((load * ctx.rng('nepa-bill', ctx.time).float(1.6, 2.6)) / 500) * 500;
      const home = await inventory.homeComfortBonus(ctx);
      return { rolledAt: ctx.time, amount: ctx.world.price(estimated, ctx.time), solar: home.power === 'solar' };
    },
    title: () => 'NEPA “estimated billing” don land',
    body: (p) =>
      `A man from the electricity company dropped a bill of ${formatNaira(num(p, 'amount'))} for light you barely saw this month. No meter reading — just "estimation".`,
    choices: [
      {
        id: 'pay',
        label: (p) => `Pay the bill (${formatNaira(num(p, 'amount'))})`,
        resolve: async (ctx, p) => {
          const amount = num(p, 'amount');
          if (await ctx.wallet.tryPay(amount, 'living-cost', 'NEPA bill (estimated)', eventKey('nepa-estimated-bill', p, 'pay'))) {
            return { title: 'Bill paid', body: 'Paid in full. Light still dey go and come, but at least your name is clean.', tone: 'neutral', moneyDelta: -amount };
          }
          return disconnect(ctx);
        },
      },
      {
        id: 'complain',
        label: () => 'Go to their office and complain',
        hint: () => 'tiring; may cut the bill',
        resolve: async (ctx, p) => {
          drainEnergy(ctx, 20);
          const reduced = ctx.rng('nepa-bill', num(p, 'rolledAt'), 'complain').chance(0.45);
          const amount = Math.round((num(p, 'amount') * (reduced ? 0.5 : 1)) / 50) * 50;
          if (!(await ctx.wallet.tryPay(amount, 'living-cost', 'NEPA bill (after complaint)', eventKey('nepa-estimated-bill', p, 'complain')))) {
            return disconnect(ctx);
          }
          return reduced
            ? { title: 'Bill halved', body: 'After three hours on the queue, the officer "adjusted" it. Small victory.', tone: 'good', moneyDelta: -amount }
            : { title: '“Come back next week”', body: 'They didn’t reduce anything. You paid in full and wasted the afternoon.', tone: 'bad', moneyDelta: -amount };
        },
      },
      {
        id: 'refuse',
        label: () => 'Refuse — dem no give light na',
        hint: (p) => (p.solar ? 'you have solar 😎' : 'they may cut your wire'),
        resolve: async (ctx, p) => {
          if (p.solar) return { title: 'Solar don save you', body: 'They cut the wire. Your panels didn’t notice. Sun dey shine.', tone: 'good' };
          return disconnect(ctx);
        },
      },
    ],
    defaultChoiceId: 'pay',
  };

  const iphoneDeal: LifeEventDefinition = {
    id: 'computer-village-iphone-deal',
    domain: 'shop',
    art: '🤡',
    weight: 1,
    cooldownDays: 40,
    eligible: async (ctx) => {
      const flagship = findItem(FLAGSHIP_PHONE);
      if (!flagship || (await inventory.quantities(ctx)).has(FLAGSHIP_PHONE)) return false;
      return ctx.wallet.canAfford(ctx.world.price(flagship.price * 0.45, ctx.time));
    },
    prepare: (ctx) => ({ rolledAt: ctx.time, price: ctx.world.price(Math.round((findItem(FLAGSHIP_PHONE)?.price ?? 0) * 0.45), ctx.time) }),
    title: () => '“Original iPhone, sealed, half price!”',
    body: (p) =>
      `A guy at Computer Village swears this iPhone 17 Pro Max is "London used, sealed, 100% original" — only ${formatNaira(num(p, 'price'))}. "Bros, decide fast, another customer dey come."`,
    choices: [
      {
        id: 'buy',
        label: (p) => `Buy am sharp-sharp (${formatNaira(num(p, 'price'))})`,
        unavailable: (ctx, p) => (ctx.wallet.canAfford(num(p, 'price')) ? null : 'You don’t have that much on you'),
        resolve: (ctx, p) => buyDeal(ctx, p, inventory),
      },
      {
        id: 'inspect',
        label: () => 'Check the IMEI and iCloud first',
        hint: () => 'tech skill helps',
        resolve: async (ctx, p) => {
          if (ctx.rng('iphone-deal', num(p, 'rolledAt'), 'inspect').chance(0.25 + ctx.character.skills.tech / 80)) {
            return { title: 'You spotted the Kirikiri copy', body: 'The IMEI belongs to a Nokia 3310. You walked away laughing.', tone: 'good' };
          }
          return buyDeal(ctx, p, inventory);
        },
      },
      {
        id: 'walk-away',
        label: () => 'Waka pass — too good to be true',
        resolve: async () => ({ title: 'Wise move', body: 'If e too sweet, e get as e be. Your money is safe.', tone: 'neutral' }),
      },
    ],
    defaultChoiceId: 'walk-away',
  };

  return [phoneSnatched, generatorRepair, nepaBill, iphoneDeal];
}

async function buyDeal(ctx: SimulationContext, params: LifeEventParams, inventory: InventoryService): Promise<LifeEventOutcome> {
  const price = num(params, 'price');
  if (!(await ctx.wallet.tryPay(price, 'purchase', 'iPhone 17 Pro Max ("sealed")', eventKey('computer-village-iphone-deal', params, 'buy')))) {
    return { title: 'Transfer failed', body: 'Your bank app declined. Maybe that was God.', tone: 'neutral' };
  }
  const fake = ctx.rng('iphone-deal', num(params, 'rolledAt'), 'fake').chance(0.72);
  const product = findProduct(fake ? CLONE_PHONE : FLAGSHIP_PHONE);
  if (product) {
    const row = await inventory.add(ctx, product, 1, 'event', price);
    if (row && !fake) await inventory.setCondition(ctx, row, 85);
  }
  return fake
    ? { title: 'E don happen', body: 'At home you opened it: the Apple logo is upside down and Siri speaks Mandarin. Kirikiri copy.', tone: 'bad', moneyDelta: -price }
    : { title: 'Jackpot — it’s real!', body: 'Slightly used, but original. You got a flagship at half price. Don’t tell anybody.', tone: 'good', moneyDelta: -price };
}
