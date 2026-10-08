import { MINUTES_PER_DAY, VEHICLE_BREAKDOWN_CONDITION, formatNaira } from '@insidelife/shared';
import type { LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { LicenceService } from './licence.service.js';
import type { GarageCar, VehiclesService } from './vehicles.service.js';

const num = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);
const text = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const money = (params: LifeEventParams, key: string): string => formatNaira(num(params, key));
const eventKey = (eventId: string, params: LifeEventParams, suffix: string): string => `event:${eventId}:${num(params, 'rolledAt')}:${suffix}`;

function addMood(ctx: SimulationContext, id: string, label: string, value: number, days: number): void {
  ctx.character.moodModifiers = [
    ...ctx.character.moodModifiers.filter((modifier) => modifier.id !== id),
    { id, label, value, until: ctx.time + days * MINUTES_PER_DAY },
  ];
}

function drainNeeds(ctx: SimulationContext, drain: { readonly energy?: number; readonly fun?: number }): void {
  const needs = ctx.character.needs;
  ctx.character.needs = {
    ...needs,
    energy: Math.max(0, needs.energy - (drain.energy ?? 0)),
    fun: Math.max(0, needs.fun - (drain.fun ?? 0)),
  };
}

/** Vehicle-domain life events: police, LASTMA, tyres, car wash boys, AC, fuel queues and breakdowns. */
export function vehicleLifeEvents(vehicles: VehiclesService, licence: LicenceService): LifeEventDefinition[] {
  const hasDrivable = async (ctx: SimulationContext): Promise<boolean> => (await vehicles.driving(ctx)) !== null;
  const carName = async (ctx: SimulationContext): Promise<string> => (await vehicles.driving(ctx))?.def.name ?? 'car';
  const carById = async (ctx: SimulationContext, params: LifeEventParams): Promise<GarageCar | undefined> =>
    (await vehicles.garage(ctx)).find(({ row }) => row.id === text(params, 'carId'));
  const damageDriving = async (ctx: SimulationContext, amount: number): Promise<void> => {
    const car = await vehicles.driving(ctx);
    if (car) await vehicles.setCondition(ctx, car, vehicles.condition(ctx, car) - amount);
  };

  /** Pay a fine if possible; otherwise the car is held at the station (wear + mood). */
  const fineOrImpound = async (ctx: SimulationContext, params: LifeEventParams, amount: number, memo: string, suffix: string): Promise<LifeEventOutcome> => {
    if (await ctx.wallet.tryPay(amount, 'fine', memo, eventKey('police-checkpoint', params, suffix))) {
      return { title: 'You paid the fine', body: `${formatNaira(amount)} gone. "Next time, carry your licence."`, tone: 'bad', moneyDelta: -amount };
    }
    await damageDriving(ctx, 10);
    addMood(ctx, 'car-impounded', 'Car impounded by police', -6, 3);
    return { title: 'They impounded your car', body: 'No money for the fine, so the car spent the night at the station. It came back with fewer side mirrors.', tone: 'bad' };
  };

  const policeCheckpoint: LifeEventDefinition = {
    id: 'police-checkpoint',
    domain: 'vehicles',
    art: '👮🏾',
    weight: 3,
    cooldownDays: 6,
    eligible: hasDrivable,
    prepare: async (ctx) => {
      const rng = ctx.rng('police-checkpoint', ctx.time);
      return {
        rolledAt: ctx.time,
        licensed: await licence.held(ctx),
        car: await carName(ctx),
        spot: rng.pick(['Ojota', 'Ikorodu Road', 'the Lekki toll gate', 'Oshodi', 'Apapa Road', 'Ketu']),
        fine: ctx.world.price(rng.int(5, 10) * 10_000, ctx.time),
        settle: ctx.world.price(rng.pick([5_000, 10_000, 20_000]), ctx.time),
      };
    },
    title: () => '“Oga, particulars!”',
    body: (p) =>
      p.licensed
        ? `Checkpoint at ${text(p, 'spot')}. An officer taps your ${text(p, 'car')} window with his rifle: "Particulars!" Your licence is in the glovebox.`
        : `Checkpoint at ${text(p, 'spot')}. An officer taps your ${text(p, 'car')} window: "Particulars! Driver's licence!" You don't have one.`,
    choices: [
      {
        id: 'show-papers',
        label: (p) => (p.licensed ? 'Show your licence and papers' : 'Show your car papers and explain'),
        hint: (p) => (p.licensed ? undefined : `fine up to ${money(p, 'fine')}`),
        resolve: async (ctx, p) => {
          if (p.licensed) {
            if (ctx.rng('police-checkpoint', num(p, 'rolledAt'), 'papers').chance(0.85)) {
              return { title: '“Safe journey, my oga”', body: 'Everything checked out. He even saluted.', tone: 'good' };
            }
            const amount = Math.round(num(p, 'fine') / 2 / 100) * 100;
            return fineOrImpound(ctx, p, amount, 'Police fine ("expired fire extinguisher")', 'papers');
          }
          return fineOrImpound(ctx, p, num(p, 'fine'), 'Police fine: driving without a licence', 'papers');
        },
      },
      {
        id: 'settle',
        label: (p) => `“Find something for the boys” (${money(p, 'settle')})`,
        hint: () => 'usually works',
        unavailable: (ctx, p) => (ctx.wallet.canAfford(num(p, 'settle')) ? null : 'You don’t have that cash on you'),
        resolve: async (ctx, p) => {
          const settle = num(p, 'settle');
          if (!(await ctx.wallet.tryPay(settle, 'fine', '“Something for the boys”', eventKey('police-checkpoint', p, 'settle')))) {
            return fineOrImpound(ctx, p, num(p, 'fine'), 'Police fine', 'settle-fine');
          }
          if (ctx.rng('police-checkpoint', num(p, 'rolledAt'), 'settle').chance(0.8)) {
            return { title: 'Waved through', body: 'The note disappeared into his pocket. "Oya go."', tone: 'neutral', moneyDelta: -settle };
          }
          const outcome = await fineOrImpound(ctx, p, Math.round(num(p, 'fine') / 2 / 100) * 100, 'Police fine (the oga came)', 'settle-oga');
          return { ...outcome, title: 'Then his oga came', moneyDelta: (outcome.moneyDelta ?? 0) - settle };
        },
      },
      {
        id: 'argue',
        label: () => '“Do you know who I am?”',
        hint: () => 'depends on your clout',
        resolve: async (ctx, p) => {
          const chance = 0.1 + ctx.character.status / 800 + ctx.character.connections / 250 + (p.licensed ? 0.3 : 0);
          if (ctx.rng('police-checkpoint', num(p, 'rolledAt'), 'argue').chance(chance)) {
            return { title: 'He recognised you', body: '"Ah, sorry sir! Go well, sir!" Clout pays.', tone: 'good' };
          }
          const amount = Math.round((num(p, 'fine') * 1.5) / 100) * 100;
          const outcome = await fineOrImpound(ctx, p, amount, 'Police fine (obstruction + attitude)', 'argue');
          return { ...outcome, title: 'Nobody knows you here' };
        },
      },
    ],
    defaultChoiceId: 'show-papers',
  };

  const lastmaTow: LifeEventDefinition = {
    id: 'lastma-tow',
    domain: 'vehicles',
    art: '🚛',
    weight: 2,
    cooldownDays: 12,
    eligible: hasDrivable,
    prepare: async (ctx) => {
      const rng = ctx.rng('lastma-tow', ctx.time);
      return {
        rolledAt: ctx.time,
        car: await carName(ctx),
        yard: rng.pick(['Ojodu Berger', 'Ikeja Along', 'Obalende', 'Lekki Phase 1']),
        fee: ctx.world.price(rng.int(5, 10) * 10_000, ctx.time),
      };
    },
    title: () => 'LASTMA don tow your car!',
    body: (p) =>
      `You parked "just for five minutes". Now your ${text(p, 'car')} is at the LASTMA yard in ${text(p, 'yard')}. Release fee: ${money(p, 'fee')}.`,
    choices: [
      {
        id: 'pay-release',
        label: (p) => `Pay the release fee (${money(p, 'fee')})`,
        resolve: async (ctx, p) => {
          const fee = num(p, 'fee');
          if (await ctx.wallet.tryPay(fee, 'fine', 'LASTMA towing & release fee', eventKey('lastma-tow', p, 'pay'))) {
            return { title: 'Car released', body: 'You paid, signed three forms and got your car back. Park well next time.', tone: 'bad', moneyDelta: -fee };
          }
          await damageDriving(ctx, 12);
          addMood(ctx, 'lastma-yard', 'Car stuck at the LASTMA yard', -5, 3);
          return { title: 'Stuck in the yard', body: 'No money for the release fee. By the time you got it out, the side mirrors had "walked away".', tone: 'bad' };
        },
      },
      {
        id: 'beg',
        label: () => 'Beg the officer',
        hint: () => 'charisma helps',
        resolve: async (ctx, p) => {
          if (ctx.rng('lastma-tow', num(p, 'rolledAt'), 'beg').chance(0.2 + ctx.character.skills.charisma / 150)) {
            return { title: 'Let off with a warning', body: '"Because you talk well, I go leave you this time."', tone: 'good' };
          }
          const fee = num(p, 'fee') + ctx.world.price(10_000, ctx.time);
          if (await ctx.wallet.tryPay(fee, 'fine', 'LASTMA fee (+ "time wasting")', eventKey('lastma-tow', p, 'beg'))) {
            return { title: 'Begging failed', body: 'He added ₦10k for wasting his time. You paid and left.', tone: 'bad', moneyDelta: -fee };
          }
          await damageDriving(ctx, 12);
          return { title: 'Begging failed', body: 'No money, no mercy. The car sat in the yard for days.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'pay-release',
  };

  const flatTyre: LifeEventDefinition = {
    id: 'flat-tyre',
    domain: 'vehicles',
    art: '🛞',
    weight: 2,
    cooldownDays: 8,
    eligible: hasDrivable,
    prepare: async (ctx) => {
      const rng = ctx.rng('flat-tyre', ctx.time);
      return {
        rolledAt: ctx.time,
        car: await carName(ctx),
        spot: rng.pick(['Ikorodu Road', 'the Lekki-Epe Expressway', 'Ojuelegba', 'Agege Motor Road']),
        cost: ctx.world.price(rng.int(3, 8) * 1_000, ctx.time),
      };
    },
    title: () => 'Flat tyre!',
    body: (p) => `Your ${text(p, 'car')} picked a nail on ${text(p, 'spot')}. There's a vulcanizer under the bridge — ${money(p, 'cost')} to patch it.`,
    choices: [
      {
        id: 'vulcanizer',
        label: (p) => `Call the vulcanizer (${money(p, 'cost')})`,
        resolve: async (ctx, p) => {
          const cost = num(p, 'cost');
          if (await ctx.wallet.tryPay(cost, 'transport', 'Vulcanizer', eventKey('flat-tyre', p, 'vulcanizer'))) {
            return { title: 'Patched and pumped', body: 'Ten minutes, one cold Malta, back on the road.', tone: 'neutral', moneyDelta: -cost };
          }
          drainNeeds(ctx, { energy: 20 });
          addMood(ctx, 'flat-tyre', 'Pushed the car home', -3, 1);
          return { title: 'Pushed it home', body: 'No cash for the vulcanizer. You and two kind strangers pushed the car home.', tone: 'bad' };
        },
      },
      {
        id: 'spare',
        label: () => 'Change it yourself (spare tyre)',
        hint: () => 'tiring',
        resolve: async (ctx, p) => {
          drainNeeds(ctx, { energy: 15 });
          if (!ctx.rng('flat-tyre', num(p, 'rolledAt'), 'spare').chance(0.3)) {
            return { title: 'Done like a pro', body: 'Jack, spanner, sweat — you changed it in 20 minutes. Area boys clapped.', tone: 'good' };
          }
          const cost = num(p, 'cost') * 2;
          if (await ctx.wallet.tryPay(cost, 'transport', 'Vulcanizer (spare was flat too)', eventKey('flat-tyre', p, 'spare'))) {
            return { title: 'The spare was flat too', body: 'Of course it was. The vulcanizer charged double for "emergency".', tone: 'bad', moneyDelta: -cost };
          }
          addMood(ctx, 'flat-tyre', 'Stranded with two flats', -4, 1);
          return { title: 'Stranded', body: 'Two flat tyres and no cash. You left the car and took okada home.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'vulcanizer',
  };

  const carWash: LifeEventDefinition = {
    id: 'car-wash-boys',
    domain: 'vehicles',
    art: '🧽',
    weight: 2,
    cooldownDays: 5,
    eligible: hasDrivable,
    prepare: async (ctx) => ({
      rolledAt: ctx.time,
      car: await carName(ctx),
      price: ctx.world.price(ctx.rng('car-wash', ctx.time).pick([2_000, 3_000, 5_000]), ctx.time),
    }),
    title: () => 'Car wash boys at the junction',
    body: (p) => `Three boys with buckets surround your ${text(p, 'car')} at the traffic light: "Oga, make we wash am? ${money(p, 'price')} only!"`,
    choices: [
      {
        id: 'wash',
        label: (p) => `Let them wash it (${money(p, 'price')})`,
        unavailable: (ctx, p) => (ctx.wallet.canAfford(num(p, 'price')) ? null : 'No cash on you'),
        resolve: async (ctx, p) => {
          const price = num(p, 'price');
          if (!(await ctx.wallet.tryPay(price, 'transport', 'Roadside car wash', eventKey('car-wash-boys', p, 'wash')))) {
            return { title: 'No cash', body: 'You waved them off.', tone: 'neutral' };
          }
          addMood(ctx, 'clean-car', 'Car is shining', 3, 1);
          ctx.character.status += 1;
          return { title: 'Shining like new', body: 'They even did the tyres with black polish. Heads are turning.', tone: 'good', moneyDelta: -price };
        },
      },
      {
        id: 'decline',
        label: () => 'Wave them off',
        resolve: async (ctx, p) => {
          if (ctx.rng('car-wash', num(p, 'rolledAt'), 'decline').chance(0.25)) {
            await damageDriving(ctx, 2);
            return { title: '“Mistake”', body: 'One of them "mistakenly" scratched your door with his bucket. Lagos.', tone: 'bad' };
          }
          return { title: 'Light turned green', body: 'You zoomed off before they could argue.', tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'decline',
  };

  const acPackedUp: LifeEventDefinition = {
    id: 'car-ac-packed-up',
    domain: 'vehicles',
    art: '🥵',
    weight: 1,
    cooldownDays: 45,
    eligible: async (ctx) => {
      const car = await vehicles.driving(ctx);
      return car !== null && vehicles.condition(ctx, car) < 85;
    },
    prepare: async (ctx) => {
      const car = await vehicles.driving(ctx);
      const base = Math.min(900_000, Math.max(45_000, Math.round(((car?.def.price ?? 0) * 0.006) / 1_000) * 1_000));
      return { rolledAt: ctx.time, car: car?.def.name ?? 'car', cost: ctx.world.price(base, ctx.time) };
    },
    title: () => 'Your car AC don pack up',
    body: (p) => `Hot air is blowing from the vents of your ${text(p, 'car')}. The AC man at Ladipo says it's the compressor — ${money(p, 'cost')}.`,
    choices: [
      {
        id: 'fix',
        label: (p) => `Fix it (${money(p, 'cost')})`,
        unavailable: (ctx, p) => (ctx.wallet.canAfford(num(p, 'cost')) ? null : 'You can’t afford the repair right now'),
        resolve: async (ctx, p) => {
          const cost = num(p, 'cost');
          if (!(await ctx.wallet.tryPay(cost, 'transport', 'Car AC repair', eventKey('car-ac-packed-up', p, 'fix')))) {
            return { title: 'Not today', body: 'The money isn’t there. Windows down it is.', tone: 'bad' };
          }
          await damageDriving(ctx, -3);
          return { title: 'Cold air is back', body: 'Gas refilled, compressor fixed. You can wear a jacket in traffic now.', tone: 'good', moneyDelta: -cost };
        },
      },
      {
        id: 'wind-down',
        label: () => 'Wind down the glass and manage',
        resolve: async (ctx) => {
          addMood(ctx, 'car-ac-dead', 'Sweating in traffic (car AC dead)', -4, 10);
          return { title: 'Windows down', body: 'Hawkers now sell to you directly through the window. Free aerobics in go-slow.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'wind-down',
  };

  const fuelQueue: LifeEventDefinition = {
    id: 'fuel-scarcity-queue',
    domain: 'vehicles',
    art: '⛽',
    weight: 3,
    cooldownDays: 4,
    eligible: async (ctx) => ctx.world.isActive(ctx.time, 'fuel-scarcity') && (await hasDrivable(ctx)),
    prepare: async (ctx) => ({
      rolledAt: ctx.time,
      car: await carName(ctx),
      jerrycan: ctx.world.price(Math.round((20 * ctx.world.economy(ctx.time).fuelPrice * 1.8) / 1_000) * 1_000, ctx.time),
    }),
    title: () => 'Fuel scarcity: the queue is 3 hours long',
    body: (p) => `Every filling station has a queue snaking onto the expressway, and your ${text(p, 'car')}'s fuel light is on.`,
    choices: [
      {
        id: 'queue',
        label: () => 'Join the queue',
        hint: () => 'costs your afternoon',
        resolve: async (ctx) => {
          drainNeeds(ctx, { energy: 25, fun: 20 });
          addMood(ctx, 'fuel-queue', 'Three hours in a fuel queue', -3, 1);
          return { title: 'Filled up — finally', body: 'Three hours, two fights and one "pump don finish" scare later, you have fuel.', tone: 'neutral' };
        },
      },
      {
        id: 'black-market',
        label: (p) => `Buy a jerrycan from the boys (${money(p, 'jerrycan')})`,
        hint: () => 'pricey; might be adulterated',
        unavailable: (ctx, p) => (ctx.wallet.canAfford(num(p, 'jerrycan')) ? null : 'You can’t afford black-market fuel'),
        resolve: async (ctx, p) => {
          const price = num(p, 'jerrycan');
          if (!(await ctx.wallet.tryPay(price, 'transport', 'Black-market fuel (20L)', eventKey('fuel-scarcity-queue', p, 'black-market')))) {
            return { title: 'No deal', body: 'You couldn’t pay. Back to the queue.', tone: 'bad' };
          }
          if (ctx.rng('fuel-queue', num(p, 'rolledAt'), 'adulterated').chance(0.15)) {
            await damageDriving(ctx, 12);
            return { title: 'Adulterated fuel!', body: 'Half water, half wahala. The engine is knocking now.', tone: 'bad', moneyDelta: -price };
          }
          return { title: 'Tank full, no queue', body: 'Expensive, but you skipped the madness.', tone: 'good', moneyDelta: -price };
        },
      },
      {
        id: 'park',
        label: () => 'Park the car and take danfo',
        resolve: async (ctx) => {
          addMood(ctx, 'fuel-queue', 'Back to danfo during scarcity', -2, 1);
          return { title: 'Danfo life again', body: '"Enter with your change!" Some things never change.', tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'queue',
  };

  const breakdown: LifeEventDefinition = {
    id: 'car-breakdown',
    domain: 'vehicles',
    art: '🔧',
    weight: 3,
    cooldownDays: 4,
    eligible: async (ctx) =>
      (await vehicles.garage(ctx)).some((car) => car.row.status === 'owned' && vehicles.condition(ctx, car) < VEHICLE_BREAKDOWN_CONDITION),
    prepare: async (ctx) => {
      const worst = (await vehicles.garage(ctx))
        .filter((car) => car.row.status === 'owned')
        .toSorted((a, b) => vehicles.condition(ctx, a) - vehicles.condition(ctx, b))[0];
      const rng = ctx.rng('car-breakdown', ctx.time);
      const base = Math.round(((worst?.def.price ?? 0) * rng.float(0.02, 0.05)) / 1_000) * 1_000;
      return {
        rolledAt: ctx.time,
        carId: worst?.row.id ?? '',
        car: worst?.def.name ?? 'car',
        spot: rng.pick(['Third Mainland Bridge', 'Ikorodu Road', 'the Lekki-Epe Expressway', 'the Oshodi under-bridge']),
        cost: ctx.world.price(Math.max(25_000, base), ctx.time),
      };
    },
    title: () => 'Your car broke down!',
    body: (p) =>
      `Your ${text(p, 'car')} coughed and died on ${text(p, 'spot')}. Skipped services have caught up with you. The mechanic says ${money(p, 'cost')}.`,
    choices: [
      {
        id: 'mechanic',
        label: (p) => `Tow it to a proper mechanic (${money(p, 'cost')})`,
        resolve: async (ctx, p) => {
          const car = await carById(ctx, p);
          const cost = num(p, 'cost');
          if (car && (await ctx.wallet.tryPay(cost, 'transport', `Breakdown repair: ${car.def.name}`, eventKey('car-breakdown', p, 'mechanic')))) {
            await vehicles.setCondition(ctx, car, vehicles.condition(ctx, car) + 25);
            return { title: 'Back on the road', body: 'New belt, new plugs, and a lecture about servicing. Listen to him.', tone: 'neutral', moneyDelta: -cost };
          }
          addMood(ctx, 'car-broke-down', 'Stranded on the road', -6, 2);
          return { title: 'Stranded', body: 'No money for the mechanic. The car is parked where it died. Repair it from the Motors app when you can.', tone: 'bad' };
        },
      },
      {
        id: 'roadside',
        label: (p) => `Roadside mechanic (${formatNaira(Math.round((num(p, 'cost') * 0.4) / 100) * 100)})`,
        hint: () => 'cheap, risky',
        resolve: async (ctx, p) => {
          const car = await carById(ctx, p);
          const cost = Math.round((num(p, 'cost') * 0.4) / 100) * 100;
          if (!car || !(await ctx.wallet.tryPay(cost, 'transport', 'Roadside mechanic', eventKey('car-breakdown', p, 'roadside')))) {
            addMood(ctx, 'car-broke-down', 'Stranded on the road', -6, 2);
            return { title: 'Stranded', body: 'Not even the roadside guy will touch it for free.', tone: 'bad' };
          }
          if (ctx.rng('car-breakdown', num(p, 'rolledAt'), 'roadside').chance(0.5)) {
            await vehicles.setCondition(ctx, car, vehicles.condition(ctx, car) + 12);
            return { title: 'Jagajaga fix, but it works', body: 'Some wire, some nylon, and the engine started. Don’t ask how.', tone: 'neutral', moneyDelta: -cost };
          }
          await vehicles.setCondition(ctx, car, vehicles.condition(ctx, car) - 5);
          return { title: 'He made it worse', body: 'He removed three parts and returned two. The car limps now.', tone: 'bad', moneyDelta: -cost };
        },
      },
      {
        id: 'abandon',
        label: () => 'Push it to the side and take okada home',
        resolve: async (ctx, p) => {
          const car = await carById(ctx, p);
          if (car) await vehicles.setCondition(ctx, car, vehicles.condition(ctx, car) - 8);
          addMood(ctx, 'car-broke-down', 'Abandoned the car on the road', -6, 2);
          return { title: 'Left it there', body: 'By morning, someone had "borrowed" the battery.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'mechanic',
  };

  return [policeCheckpoint, lastmaTow, flatTyre, carWash, acPackedUp, fuelQueue, breakdown];
}
