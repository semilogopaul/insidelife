/**
 * Economy simulation: boots the real game in-process with a controllable clock and plays bot characters with
 * different life strategies for several game years, then reports how wealth spreads and how the money supply moves.
 *
 *   npm run build && DATABASE_URL=<throwaway db> DATABASE_SYNCHRONIZE=true node dist/tools/economy-sim.js --per 3 --years 4
 *
 * Use a throwaway database: bots are real characters. Bots "teleport" to venues they need (a CBT centre for JAMB)
 * because movement isn't what we're testing — the economy is.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  DAYS_PER_YEAR,
  MINUTES_PER_DAY,
  formatClock,
  formatNairaCompact,
  startOfDay,
  TERMS_VERSION,
  type BodyType,
  type Habit,
  type Gender,
  type HairStyle,
  type LifestyleTier,
} from '@insidelife/shared';
import { AppModule } from '../app.module.js';
import { ApplicationsService } from '../modules/careers/applications.service.js';
import { JobBoardService } from '../modules/careers/job-board.service.js';
import { BusinessesService } from '../modules/businesses/businesses.service.js';
import { AdmissionsService } from '../modules/education/services/admissions.service.js';
import { EnrolmentService } from '../modules/education/services/enrolment.service.js';
import { NyscService } from '../modules/education/services/nysc.service.js';
import { EducationOverviewService } from '../modules/education/services/overview.service.js';
import { WaecJambService } from '../modules/education/services/waec-jamb.service.js';
import { DepositsService } from '../modules/investments/deposits.service.js';
import { TradingService } from '../modules/investments/trading.service.js';
import { LedgerService } from '../modules/ledger/ledger.service.js';
import { SYSTEM_ACCOUNTS, type SystemAccount } from '../modules/ledger/interfaces/ledger.interfaces.js';
import { CharacterCreationService } from '../modules/life/character-creation.service.js';
import { SettingsService } from '../modules/life/settings.service.js';
import { SnapshotService } from '../modules/life/snapshot.service.js';
import { ShopService } from '../modules/shop/shop.service.js';
import { CharacterSession } from '../modules/simulation/character-session.service.js';
import type { SimulationContext } from '../modules/simulation/simulation-context.js';
import { SimulationEngine } from '../modules/simulation/simulation-engine.service.js';
import { SimulationRegistry } from '../modules/simulation/simulation-registry.service.js';
import { UsersService } from '../modules/users/users.service.js';
import { VehiclesService } from '../modules/vehicles/vehicles.service.js';
import { WorldService } from '../modules/world/world.service.js';
import { CharacterEntity } from '../modules/characters/entities/character.entity.js';

const STRATEGIES = ['idle', 'hustler', 'scholar', 'techie', 'investor', 'spender', 'entrepreneur'] as const;
type Strategy = (typeof STRATEGIES)[number];

interface Bot {
  readonly id: string;
  readonly strategy: Strategy;
  readonly label: string;
}

interface Services {
  readonly session: CharacterSession;
  readonly engine: SimulationEngine;
  readonly jobs: JobBoardService;
  readonly applications: ApplicationsService;
  readonly waecJamb: WaecJambService;
  readonly admissions: AdmissionsService;
  readonly nysc: NyscService;
  readonly enrolments: EnrolmentService;
  readonly education: EducationOverviewService;
  readonly shop: ShopService;
  readonly vehicles: VehiclesService;
  readonly trading: TradingService;
  readonly deposits: DepositsService;
  readonly businesses: BusinessesService;
  readonly snapshots: SnapshotService;
  readonly settings: SettingsService;
  readonly registry: SimulationRegistry;
  readonly ledger: LedgerService;
}

interface Sample {
  readonly day: number;
  readonly strategy: Strategy;
  readonly label: string;
  readonly alive: boolean;
  readonly age: number;
  readonly cash: number;
  readonly netWorth: number;
  readonly selfMade: number;
  readonly earned: number;
  readonly job: string;
  readonly education: string;
  readonly health: number;
  readonly skills: string;
  /** Where the net worth sits: ledger accounts and each system's assets. */
  readonly breakdown: string;
}

const arg = (name: string, fallback: number): number => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
};

/** This is a CLI report: write lines straight to stdout. */
const print = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

/** `--verbose` prints every refusal a bot gets (useful when a strategy stalls). */
const VERBOSE = process.argv.includes('--verbose');

const quietly = async (run: () => Promise<unknown>, what = 'bot step'): Promise<void> => {
  try {
    await run();
  } catch (error) {
    // Bots try things that may legitimately be refused (not eligible, can't afford); that's the game.
    if (VERBOSE) print(`      ✗ ${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/** Start a timed action directly (bots don't pay for study/coding sessions anyway). */
function startAction(ctx: SimulationContext, services: Services, actionId: string, minutes: number): void {
  if (ctx.character.activity || ctx.character.travel) return;
  services.engine.start(ctx, { actionId, startedAt: ctx.time, endsAt: ctx.time + minutes, locationId: ctx.character.locationId, cost: 0 });
}

function teleport(ctx: SimulationContext, venueId: string): void {
  ctx.character.travel = null;
  ctx.character.activity = null;
  ctx.character.locationId = venueId;
  ctx.character.regionId = 'lagos';
}

/** `maxShiftHours` keeps evenings free for a study/coding habit (a 12-hour danfo shift leaves nothing). */
async function applyBestJob(ctx: SimulationContext, services: Services, maxShiftHours = 24): Promise<void> {
  const board = await services.jobs.board(ctx);
  if (board.jobs.some((job) => job.current) || board.jobs.some((job) => job.application && job.application.status === 'pending')) return;
  const candidates = board.jobs
    .filter((job) => job.eligible && !job.application && job.estimatedChance > 0 && job.schedule.hours <= maxShiftHours)
    .toSorted((a, b) => b.entryPayNaira * b.estimatedChance - a.entryPayNaira * a.estimatedChance);
  const best = candidates[0];
  if (best) await quietly(() => services.applications.apply(ctx, best.id), `apply for ${best.id}`);
}

type Phase = 'errands';
/**
 * Bots run errands at 10:00 (offices and exam halls are open). Studying, coding and managing a business happen
 * through daily habits, exactly like a player who sets a routine and logs off.
 */
const PHASE_HOUR: Readonly<Record<Phase, number>> = { errands: 10 };

const STUDY_FRIENDLY_SHIFT_HOURS = 9;

const habit = (actionId: Habit['actionId'], hour: number, hours: number): Habit => ({
  actionId,
  startMinute: hour * 60,
  durationMinutes: hours * 60,
  days: 'daily',
});

/** The scholar plays the education loop the way a player would: JAMB → admission → degree → NYSC → graduate job. */
async function scholar(ctx: SimulationContext, day: number, services: Services): Promise<void> {
  const education = await services.education.overview(ctx);
  const enrolled = education.enrolment && education.enrolment.status !== 'graduated' && education.enrolment.status !== 'withdrawn';
  const exam = education.jamb.current;
  if (day === 0) await quietly(() => services.settings.update(ctx, { habits: [habit('study', 20, 1)] }), 'set study habit');
  if (VERBOSE && day % 15 === 0) {
    const examState = exam ? `${exam.status} sit-from d+${Math.round((exam.canSitFrom - ctx.time) / 1440)}` : 'none';
    print(`      · d${day} ${ctx.character.firstName} ${ctx.character.lastName}: ${education.headline} | JAMB ${examState} score ${education.jamb.score ?? '-'} | apps ${education.applications.map((a) => `${a.institutionId}:${a.status}`).join(',') || '-'} | enrol ${education.enrolment?.status ?? '-'}`);
  }
  if (enrolled) {
    if (education.enrolment!.fees.due > 0) await quietly(() => services.enrolments.payFees(ctx), 'pay school fees');
    return;
  }
  if (education.degrees.length > 0) {
    if (education.nysc.status === 'pending') await quietly(() => services.nysc.register(ctx), 'register NYSC');
    if (day % 3 === 0) await applyBestJob(ctx, services);
    return;
  }
  const offer = education.applications.find((application) => application.status === 'offered');
  if (offer) return quietly(() => services.admissions.accept(ctx, offer.id), 'accept admission');
  if (education.applications.some((application) => application.status === 'screening')) return;

  if (exam && exam.status === 'registered') {
    if (ctx.time >= exam.canSitFrom) {
      teleport(ctx, exam.venueId);
      await quietly(() => services.waecJamb.startSitting(ctx, exam.id), 'sit JAMB');
    }
    return;
  }
  if (exam && exam.status !== 'released') return;

  const score = education.jamb.score;
  const recentlyApplied = education.applications.some((application) => application.appliedAt > ctx.time - 120 * 1440);
  if (score !== null && !recentlyApplied) {
    // Like a sensible applicant: the best-fitting course at three different schools — one ambitious, two safe.
    const options = education.catalogue.institutions
      .map((institution) => ({
        institution,
        course: institution.courses.filter((course) => course.eligible && course.cutoff <= score).toSorted((a, b) => b.cutoff - a.cutoff)[0],
      }))
      .filter((option): option is { institution: (typeof option)['institution']; course: NonNullable<(typeof option)['course']> } => option.course !== undefined)
      .toSorted((a, b) => b.institution.prestige - a.institution.prestige)
      .filter((_, index, all) => index === 0 || index >= all.length - 2);
    for (const { institution, course } of options) {
      await quietly(() => services.admissions.apply(ctx, institution.id, course.courseId), `apply to ${institution.shortName} ${course.courseId}`);
    }
    if (options.length > 0) return;
  }
  // No usable score (or nothing worked out): register for the next UTME, working in the meantime.
  teleport(ctx, 'cbt-yaba');
  await quietly(() => services.waecJamb.register(ctx, 'jamb', 'unilag', 'accounting'), 'register JAMB');
  if (day % 3 === 0) await applyBestJob(ctx, services, STUDY_FRIENDLY_SHIFT_HOURS);
}

async function act(bot: Bot, day: number, phase: Phase, ctx: SimulationContext, services: Services): Promise<void> {
  const character = ctx.character;
  if (!character.alive) return;
  const setLifestyle = (tier: LifestyleTier): void => {
    character.lifestyle = tier;
  };
  const errands = phase === 'errands';
  if (!errands) return;

  switch (bot.strategy) {
    case 'idle':
      return;

    case 'hustler':
      if (day === 0 && errands) setLifestyle('managing');
      if (errands && day % 3 === 0) await applyBestJob(ctx, services);
      return;

    case 'scholar':
      return scholar(ctx, day, services);

    case 'techie':
      if (day === 0) await quietly(() => services.shop.purchase(ctx, 'laptop-hp-uk'), 'buy laptop');
      // The laptop is delivered a few days after an online order; set the routine once it's here.
      if (character.habits.length === 0) await quietly(() => services.settings.update(ctx, { habits: [habit('learn-code', 20, 1)] }), 'set coding habit');
      if (day === 30) await quietly(() => services.shop.purchase(ctx, 'inverter'), 'buy inverter');
      if (day % 5 === 0) await applyBestJob(ctx, services, STUDY_FRIENDLY_SHIFT_HOURS);
      return;

    case 'investor':
      if (day % 3 === 0) await applyBestJob(ctx, services);
      if (day % 30 === 15) {
        const spare = Math.floor((ctx.wallet.cash - 400_000) * 0.5);
        if (spare > 50_000) {
          await quietly(() => services.deposits.open(ctx, { product: 'tbill', tenorDays: 364, amount: Math.floor(spare * 0.6) }, randomUUID()), 'buy T-bill');
          await quietly(
            () => services.trading.placeOrder(ctx, { instrumentId: 'EKOTRUST', side: 'buy', size: { amountNaira: Math.floor(spare * 0.4) } }, randomUUID()),
            'buy shares',
          );
        }
      }
      return;

    case 'spender':
      if (day === 0) {
        setLifestyle('soft-life');
        await quietly(() => services.vehicles.purchase(ctx, 'honda-accord-2005'), 'buy car');
        await quietly(() => services.shop.purchase(ctx, 'tv-55'), 'buy TV');
      }
      if (day % 3 === 0) await applyBestJob(ctx, services);
      return;

    case 'entrepreneur':
      if (day % 2 === 0) startAction(ctx, services, 'manage-business', 120);
      if (day === 0) {
        await quietly(
          () => services.businesses.start(ctx, { typeId: 'pos-kiosk', name: `${character.firstName}'s POS`, districtId: character.homeDistrictId }),
          'start POS kiosk',
        );
      }
      if (day === 120) {
        await quietly(
          () => services.businesses.start(ctx, { typeId: 'provision-store', name: `${character.firstName} Provisions`, districtId: character.homeDistrictId }),
          'start provision store',
        );
      }
      return;
  }
}

async function netWorthBreakdown(ctx: SimulationContext, services: Services): Promise<string> {
  const balances = await services.ledger.balances(ctx.manager, ctx.character.id);
  const parts: Array<[string, number]> = [
    ['cash', balances.cash],
    ['savings', balances.savings],
    ['pension', balances.pension],
    ['usd', Math.round((balances.usd / 100) * ctx.world.economy(ctx.time).usdRate)],
  ];
  for (const system of services.registry.all) if (system.netWorth) parts.push([system.key, await system.netWorth(ctx)]);
  return parts
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${key} ${formatNairaCompact(value)}`)
    .join(', ');
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

async function main(): Promise<void> {
  const perStrategy = arg('per', 3);
  const years = arg('years', 4);
  const reportEvery = arg('report-every', 90);
  // `--trace hustler --trace-from 10 --trace-days 2` prints that bot's needs hour by hour.
  const traceIndex = process.argv.indexOf('--trace');
  const traceStrategy = traceIndex >= 0 ? (process.argv[traceIndex + 1] as Strategy) : undefined;
  const traceFrom = arg('trace-from', 10);
  const traceDays = arg('trace-days', 2);
  const totalDays = Math.round(years * DAYS_PER_YEAR);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const get = <T>(type: abstract new (...args: never[]) => T): T => app.get(type as never, { strict: false }) as T;
  const world = get(WorldService);
  // Start at midnight so day boundaries (and traces) line up with the calendar.
  let simTime = startOfDay(world.now()) + MINUTES_PER_DAY;
  // Controllable clock: every service reads time through WorldService.now().
  world.now = () => simTime;

  const services: Services = {
    session: get(CharacterSession),
    engine: get(SimulationEngine),
    jobs: get(JobBoardService),
    applications: get(ApplicationsService),
    waecJamb: get(WaecJambService),
    admissions: get(AdmissionsService),
    nysc: get(NyscService),
    enrolments: get(EnrolmentService),
    education: get(EducationOverviewService),
    shop: get(ShopService),
    vehicles: get(VehiclesService),
    trading: get(TradingService),
    deposits: get(DepositsService),
    businesses: get(BusinessesService),
    snapshots: get(SnapshotService),
    settings: get(SettingsService),
    registry: get(SimulationRegistry),
    ledger: get(LedgerService),
  };
  const users = get(UsersService);
  const creation = get(CharacterCreationService);
  const ledger = get(LedgerService);
  const dataSource = app.get<DataSource>(getDataSourceToken() as never);

  const run = randomUUID().slice(0, 6);
  const bots: Bot[] = [];
  const looks: ReadonlyArray<{ gender: Gender; hair: HairStyle; body: BodyType }> = [
    { gender: 'female', hair: 'braids', body: 'curvy' },
    { gender: 'male', hair: 'fade', body: 'average' },
  ];
  let n = 0;
  // `--only scholar,techie` limits the cohort to some strategies.
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex >= 0 ? new Set((process.argv[onlyIndex + 1] ?? '').split(',')) : null;
  for (const strategy of STRATEGIES.filter((key) => !only || only.has(key))) {
    for (let i = 0; i < perStrategy; i++, n++) {
      const look = looks[n % looks.length]!;
      const user = await users.create(`sim-${run}-${n}@example.com`, 'not-a-real-hash', '2000-01-01', TERMS_VERSION);
      const created = await creation.create(user.id, {
        firstName: 'Sim',
        lastName: `Bot${n}`,
        handle: `sim${run}${n}`,
        gender: look.gender,
        stateOfOrigin: 'lagos',
        appearance: { bodyType: look.body, height: 1, skinTone: n % 8, hairStyle: look.hair, hairColor: 0, facialHair: 'none', eyeStyle: 'almond' },
      });
      bots.push({ id: created.characterId, strategy, label: `${strategy}#${i} (${created.background})` });
    }
  }
  print(`Simulating ${bots.length} bots for ${years} game years (${totalDays} days)…`);

  const samples: Sample[] = [];
  const started = Date.now();
  const firstDay = simTime;
  const traced = traceStrategy ? bots.find((bot) => bot.strategy === traceStrategy) : undefined;
  for (let day = 0; day <= totalDays; day++) {
    const dayStart = firstDay + day * MINUTES_PER_DAY;
    const tracing = traced !== undefined && day >= traceFrom && day < traceFrom + traceDays;
    const hours = tracing ? Array.from({ length: 24 }, (_, hour) => hour) : Object.values(PHASE_HOUR);
    for (const hour of hours) {
      simTime = dayStart + hour * 60;
      const phase = (Object.keys(PHASE_HOUR) as Phase[]).find((key) => PHASE_HOUR[key] === hour);
      if (phase) {
        for (const bot of bots) {
          await quietly(() => services.session.run({ characterId: bot.id }, (ctx) => act(bot, day, phase, ctx, services)), `${bot.label} ${phase}`);
        }
      }
      if (tracing) {
        await quietly(() =>
          services.session.run({ characterId: traced.id }, (ctx) => {
            const c = ctx.character;
            const needs = Object.entries(c.needs)
              .map(([key, value]) => `${key.slice(0, 3)} ${String(Math.round(value)).padStart(3)}`)
              .join(' ');
            const doing = c.travel ? `→ ${c.travel.toLocationId}` : (c.activity?.actionId ?? c.locationId);
            print(`    d${day} ${formatClock(ctx.time)}  health ${c.health.toFixed(1).padStart(5)}  ${needs}  ${doing}`);
            return Promise.resolve();
          }),
        );
      }
    }
    if (day % reportEvery === 0 || day === totalDays) {
      for (const bot of bots) {
        await quietly(() =>
          services.session.run({ characterId: bot.id }, async (ctx) => {
            const summary = await services.snapshots.summary(ctx);
            const c = ctx.character;
            samples.push({
              day,
              strategy: bot.strategy,
              label: bot.label,
              alive: c.alive,
              age: ctx.age,
              cash: ctx.wallet.cash,
              netWorth: c.netWorth,
              selfMade: Math.max(0, c.netWorth - c.unearnedTotal),
              earned: c.earnedTotal,
              job: summary.job?.title ?? '-',
              education: summary.education?.label ?? '-',
              health: Math.round(c.health),
              skills: `int ${Math.round(c.skills.intellect)} tech ${Math.round(c.skills.tech)} hus ${Math.round(c.skills.hustle)}`,
              breakdown: await netWorthBreakdown(ctx, services),
            });
          }),
        );
      }
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      print(`  day ${day} (year ${(day / DAYS_PER_YEAR).toFixed(1)}) — ${elapsed}s`);
    }
  }

  // ----- Report ---------------------------------------------------------------------------------------------------
  const finalDay = samples.reduce((max, sample) => Math.max(max, sample.day), 0);
  print('\nMedian net worth by strategy (self-made in brackets):');
  const checkpoints = [...new Set(samples.map((sample) => sample.day))];
  for (const strategy of STRATEGIES.filter((key) => !only || only.has(key))) {
    const cells = checkpoints.map((day) => {
      const rows = samples.filter((sample) => sample.strategy === strategy && sample.day === day);
      return `${formatNairaCompact(median(rows.map((row) => row.netWorth)))} (${formatNairaCompact(median(rows.map((row) => row.selfMade)))})`;
    });
    print(`  ${strategy.padEnd(13)} ${cells.join(' | ')}`);
  }

  print('\nFinal state per bot:');
  for (const sample of samples.filter((row) => row.day === finalDay)) {
    print(
      `  ${sample.label.padEnd(30)} ${sample.alive ? 'alive' : 'DEAD '} age ${String(sample.age).padStart(2)}  worth ${formatNairaCompact(sample.netWorth).padStart(8)}  self-made ${formatNairaCompact(sample.selfMade).padStart(8)}  health ${String(sample.health).padStart(3)}  ${sample.skills}  job: ${sample.job} | ${sample.education}\n      ${sample.breakdown}`,
    );
  }

  const systemBalance = (key: SystemAccount): Promise<number> => ledger.systemBalance(key);
  const minted = -(await systemBalance('mint'));
  const burned = await systemBalance('burn');
  const taxed = await systemBalance('tax');
  const fees = await systemBalance('fees');
  const characters = await dataSource.getRepository(CharacterEntity).count();
  print('\nMoney supply (all characters in this database):');
  print(`  minted (faucets) ${formatNairaCompact(minted)} · burned ${formatNairaCompact(burned)} · tax ${formatNairaCompact(taxed)} · fees ${formatNairaCompact(fees)} · characters ${characters}`);
  print(`  sink/faucet ratio ${((burned + taxed + fees) / Math.max(1, minted)).toFixed(2)} (system codes: ${Object.values(SYSTEM_ACCOUNTS).join(', ')})`);

  // `--out samples.json` keeps every sample for charts.
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  if (out) writeFileSync(out, JSON.stringify({ years, perStrategy, samples }, null, 2));
  print(`\n${out ? `Samples written to ${out} · ` : ''}${((Date.now() - started) / 1000).toFixed(0)}s`);
  await app.close();
}

await main();
