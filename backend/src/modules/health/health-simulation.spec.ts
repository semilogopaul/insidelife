import { randomUUID } from 'node:crypto';
import type { ModuleRef } from '@nestjs/core';
import { FindOperator, type EntityManager } from 'typeorm';
import {
  MINUTES_PER_DAY,
  PREGNANCY_MINUTES,
  homeLocationId,
  realMsAt,
  type DistrictId,
  type Gender,
  type LedgerKind,
  type LifestyleTier,
  type ProfileContext,
} from '@insidelife/shared';
import type { FamilyPort, FamilySnapshot } from '../../common/ports/family.port.js';
import type { InventoryPort } from '../../common/ports/inventory.port.js';
import type { CharacterEntity, TravelState } from '../characters/entities/character.entity.js';
import type { CharacterWallet } from '../simulation/simulation-context.js';
import { SimulationContext } from '../simulation/simulation-context.js';
import type { SimulationEngine } from '../simulation/simulation-engine.service.js';
import type { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import type { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import type { WorldService } from '../world/world.service.js';
import { AdmissionsService } from './admissions.service.js';
import { ConditionsService } from './conditions.service.js';
import { HealthConditionEntity } from './entities/health-condition.entity.js';
import { HospitalAdmissionEntity } from './entities/hospital-admission.entity.js';
import { PregnancyEntity } from './entities/pregnancy.entity.js';
import { HealthProfileService } from './health-profile.service.js';
import { HealthSystem } from './health.system.js';
import { InsuranceService } from './insurance.service.js';
import { MedicalHistoryService } from './medical-history.service.js';
import { MortalityService } from './mortality.service.js';
import { PregnancyService } from './pregnancy.service.js';
import { TreatmentService } from './treatment.service.js';

type Row = Record<string, unknown>;
type EntityClass = new () => object;

/** Just enough of TypeORM's EntityManager for the health services: equality/In filters, single-key ordering. */
class MemoryManager {
  private readonly tables = new Map<EntityClass, Row[]>();
  private sequence = 0;

  /** Deterministic ids: rolls are keyed by record id, so tests must not depend on random UUIDs. */
  private nextId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`;
  }

  rows(entity: EntityClass): Row[] {
    let rows = this.tables.get(entity);
    if (!rows) {
      rows = [];
      this.tables.set(entity, rows);
    }
    return rows;
  }

  create(entity: EntityClass, data: Row): Row {
    return Object.assign(new entity(), data) as Row;
  }

  async save(entity: Row): Promise<Row> {
    const rows = this.rows(entity.constructor as EntityClass);
    if ('id' in entity && !entity.id) entity.id = this.nextId();
    if (!rows.includes(entity)) rows.push(entity);
    return entity;
  }

  async insert(entity: EntityClass, data: Row): Promise<void> {
    this.rows(entity).push(Object.assign(new entity(), { id: this.nextId(), ...data }) as Row);
  }

  async find(entity: EntityClass, options: { where?: Row; order?: Record<string, 'ASC' | 'DESC'>; take?: number } = {}): Promise<Row[]> {
    const matches = this.rows(entity).filter((row) =>
      Object.entries(options.where ?? {}).every(([key, expected]) =>
        expected instanceof FindOperator && expected.type === 'in' ? (expected.value as unknown[]).includes(row[key]) : row[key] === expected,
      ),
    );
    const [orderKey, direction] = Object.entries(options.order ?? {})[0] ?? [];
    if (orderKey) matches.sort((a, b) => (Number(a[orderKey]) - Number(b[orderKey])) * (direction === 'DESC' ? -1 : 1));
    return matches.slice(0, options.take ?? matches.length);
  }

  async findOne(entity: EntityClass, options: { where?: Row; order?: Record<string, 'ASC' | 'DESC'> }): Promise<Row | null> {
    return (await this.find(entity, options))[0] ?? null;
  }
}

interface Payment {
  readonly amount: number;
  readonly kind: LedgerKind;
  readonly key: string;
}

/** Wallet double: tracks cash, every payment and every receipt; tryPay fails when broke. */
class FakeWallet {
  readonly payments: Payment[] = [];
  readonly receipts: Payment[] = [];
  constructor(public cash: number) {}
  canAfford(amount: number): boolean {
    return this.cash >= amount;
  }
  async pay(amount: number, kind: LedgerKind, _memo: string, key: string): Promise<void> {
    this.cash -= amount;
    this.payments.push({ amount, kind, key });
  }
  async tryPay(amount: number, kind: LedgerKind, memo: string, key: string): Promise<boolean> {
    if (amount > 0 && !this.canAfford(amount)) return false;
    if (amount > 0) await this.pay(amount, kind, memo, key);
    return true;
  }
  async receive(amount: number, kind: LedgerKind, _memo: string, key: string): Promise<void> {
    this.cash += amount;
    this.receipts.push({ amount, kind, key });
  }
}

class FakeFamily implements FamilyPort {
  readonly births: string[] = [];
  async snapshot(): Promise<FamilySnapshot> {
    return { members: [], relationship: 'married', partner: null, children: [] };
  }
  async adjustCloseness(): Promise<void> {}
  async recordBirth(_ctx: SimulationContext, partnerName: string): Promise<void> {
    this.births.push(partnerName);
  }
}

const START = 900 * MINUTES_PER_DAY;
const CLOCK = { epochRealMs: 0, epochGameMinute: 0, scale: 120 };

interface SetupOptions {
  readonly gender?: Gender;
  readonly cash?: number;
  readonly age?: number;
  readonly lifestyle?: LifestyleTier;
  readonly health?: number;
}

function setup(options: SetupOptions = {}) {
  const id = randomUUID();
  const character = {
    id,
    seed: 'health-spec',
    gender: options.gender ?? 'female',
    firstName: 'Ada',
    lastName: 'Okafor',
    bornAt: START - (options.age ?? 28) * 360 * MINUTES_PER_DAY,
    alive: true,
    diedAt: null,
    causeOfDeath: null,
    health: options.health ?? 80,
    fitness: 40,
    connections: 5,
    lifestyle: options.lifestyle ?? 'managing',
    needs: { energy: 70, hunger: 70, hygiene: 70, fun: 70, social: 70 },
    moodModifiers: [],
    homeDistrictId: 'mushin' as DistrictId,
    locationId: homeLocationId(id),
    regionId: 'lagos',
    activity: null,
    travel: null,
    settledAt: START,
    lastActiveAt: new Date(realMsAt(CLOCK, START)),
  } as unknown as CharacterEntity;
  const manager = new MemoryManager();
  const world = { seed: 'world', clock: CLOCK, price: (base: number) => base } as unknown as WorldService;
  const ctx = new SimulationContext(character, manager as unknown as EntityManager, world, START);
  const wallet = new FakeWallet(options.cash ?? 0);
  ctx.bindWallet(wallet as unknown as CharacterWallet);

  const family = new FakeFamily();
  const history = new MedicalHistoryService();
  const conditions = new ConditionsService(history);
  const insurance = new InsuranceService(history);
  const admissions = new AdmissionsService(conditions, insurance, history);
  const profiles = new HealthProfileService();
  const context: ProfileContext = { comfort: 40, bedQuality: 0.2, jobStress: 0, energyCap: 100 };
  const planner = {
    place: async () => ({ districtId: 'mushin', regionId: 'lagos' }),
    profileContext: async () => context,
  } as unknown as TimelinePlanner;
  const engine = { mood: () => 45, start: () => undefined } as unknown as SimulationEngine;
  const moduleRef = { get: () => family } as unknown as ModuleRef;
  const inventory = { hasTag: async () => false } as unknown as InventoryPort;
  const service = new PregnancyService(conditions, insurance, admissions, history, planner, moduleRef);
  const treatment = new TreatmentService(conditions, insurance, admissions, service, history, profiles, engine, planner);
  const mortality = new MortalityService(conditions, history, engine);
  const system = new HealthSystem({} as SimulationRegistry, planner, engine, conditions, treatment, admissions, insurance, service, mortality, profiles, inventory);
  return { ctx, character, manager, wallet, family, conditions, admissions, service, treatment, mortality, system };
}

/** The player makes a move right now (keeps them "present" at the simulated moment). */
function playerActs(ctx: SimulationContext): void {
  ctx.character.lastActiveAt = new Date(realMsAt(CLOCK, ctx.time));
}

/** The player closed the app long ago. */
function playerAway(ctx: SimulationContext): void {
  ctx.character.lastActiveAt = new Date(0);
}

/** Run the health system's day end for `days` days like the engine does (stops at death). */
async function liveHealthDays(ctx: SimulationContext, system: HealthSystem, days: number, beforeEachDay?: () => Promise<void> | void): Promise<void> {
  for (let day = 0; day < days && ctx.character.alive; day++) {
    ctx.time = (Math.floor(ctx.time / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
    ctx.character.moodModifiers = ctx.character.moodModifiers.filter((modifier) => modifier.until > ctx.time);
    await beforeEachDay?.();
    await system.onDayEnd(ctx, ctx.time / MINUTES_PER_DAY - 1);
  }
}

/** Walk the simulation clock day by day, running the pregnancy's day-end hook like the engine does. */
async function liveDays(ctx: SimulationContext, service: PregnancyService, days: number): Promise<void> {
  for (let day = 0; day < days; day++) {
    ctx.time = (Math.floor(ctx.time / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
    await service.onDayEnd(ctx, ctx.time / MINUTES_PER_DAY - 1);
  }
}

describe('pregnancy timeline (PregnancyService)', () => {
  it('carries a pregnancy for nine months, reminds about antenatal care and delivers at a public hospital', async () => {
    const { ctx, manager, wallet, family, conditions, service } = setup({ gender: 'female', cash: 2_000_000 });
    await service.conceive(ctx, 'Tunde');

    const pregnancy = await service.current(ctx);
    expect(pregnancy?.carrier).toBe('self');
    expect(pregnancy?.dueAt).toBe(START + PREGNANCY_MINUTES);
    expect((await conditions.find(ctx, 'pregnancy'))?.diagnosed).toBe(true);
    expect(await service.conceive(ctx, 'Someone else')).toBeNull();

    await liveDays(ctx, service, 269);
    expect(await service.current(ctx)).not.toBeNull();
    expect(family.births).toHaveLength(0);
    expect(ctx.notifications.filter((notification) => notification.title === 'Antenatal visit due')).toHaveLength(4);
    expect(ctx.notifications.some((notification) => notification.title === 'One month to go!')).toBe(true);

    await liveDays(ctx, service, 1);
    expect(await service.current(ctx)).toBeNull();
    expect(family.births).toEqual(['Tunde']);
    expect(await conditions.find(ctx, 'pregnancy')).toBeUndefined();
    const delivered = manager.rows(PregnancyEntity)[0] as unknown as PregnancyEntity;
    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveredAt).toBe(START + PREGNANCY_MINUTES);
    expect(delivered.deliveryVenueId).toBe('luth');
    expect(wallet.payments.filter((payment) => payment.kind === 'health')).toHaveLength(1);
    const admission = manager.rows(HospitalAdmissionEntity)[0] as unknown as HospitalAdmissionEntity;
    expect(admission.pregnancyId).toBe(delivered.id);
    expect(admission.dailyRate).toBe(0);
    expect(ctx.notifications.some((notification) => notification.title.includes('It’s a baby'))).toBe(true);
  });

  it('collapses overdue antenatal reminders into a single nudge', async () => {
    const { ctx, service } = setup({ gender: 'female', cash: 1_000_000 });
    await service.conceive(ctx, 'Tunde');
    ctx.time += 200 * MINUTES_PER_DAY;
    await liveDays(ctx, service, 1);
    expect(ctx.notifications.filter((notification) => notification.title === 'Antenatal visit due')).toHaveLength(1);
    await liveDays(ctx, service, 30);
    expect(ctx.notifications.filter((notification) => notification.title === 'Antenatal visit due')).toHaveLength(1);
    await liveDays(ctx, service, 20);
    expect(ctx.notifications.filter((notification) => notification.title === 'Antenatal visit due')).toHaveLength(2);
  });

  it('counts antenatal visits, plans delivery where they happened and stops reminding once on schedule', async () => {
    const { ctx, service } = setup({ gender: 'female', cash: 5_000_000 });
    const pregnancy = await service.conceive(ctx, 'Tunde');
    if (!pregnancy) throw new RangeError('expected a pregnancy');

    await liveDays(ctx, service, 61);
    await service.completeAntenatal(ctx, pregnancy.id, 'island-specialist', 'hospital-private');
    expect(pregnancy.antenatalVisits).toBe(1);
    expect(pregnancy.plannedFacility).toBe('hospital-private');
    const reminders = (): number => ctx.notifications.filter((notification) => notification.title === 'Antenatal visit due').length;
    expect(reminders()).toBe(1);
    await liveDays(ctx, service, 30);
    expect(reminders()).toBe(1);
  });

  it('tracks a partner’s pregnancy for a male character and the baby is still born when he is broke', async () => {
    const { ctx, manager, wallet, family, conditions, service } = setup({ gender: 'male', cash: 0 });
    await service.conceive(ctx, 'Chioma');
    expect((await service.current(ctx))?.carrier).toBe('partner');
    expect(await conditions.find(ctx, 'pregnancy')).toBeUndefined();

    await liveDays(ctx, service, 270);
    expect(family.births).toEqual(['Chioma']);
    expect(wallet.payments).toHaveLength(0);
    expect(manager.rows(HospitalAdmissionEntity)).toHaveLength(0);
    expect(ctx.notifications.some((notification) => notification.body.includes('social welfare'))).toBe(true);
  });
});

function ride(from: string, to: string, departAt: number): TravelState {
  return { fromLocationId: from, toLocationId: to, mode: 'danfo', departAt, arriveAt: departAt + 30, fare: 0 };
}

describe('hospital admissions (AdmissionsService)', () => {
  it('treats going home after the discharge time as a normal discharge', async () => {
    const { ctx, character, conditions, admissions } = setup({ cash: 500_000 });
    const malaria = await conditions.create(ctx, 'malaria', 'moderate', 'fixture');
    const admission = await admissions.admit(ctx, { venueId: 'luth', facility: 'hospital-public', days: 3, reason: 'Malaria treatment', conditionRecordId: malaria.id });

    ctx.time = admission.dischargeAt + 13 * 60;
    await admissions.onTravel(ctx, ride('luth', character.locationId, ctx.time));

    expect(admission.status).toBe('discharged');
    expect(malaria.status).toBe('recovered');
    expect(ctx.notifications.some((notification) => notification.title === 'You discharged yourself')).toBe(false);
  });

  it('treats leaving mid-stay as self-discharge with the illness unresolved', async () => {
    const { ctx, character, conditions, admissions } = setup({ cash: 500_000 });
    const malaria = await conditions.create(ctx, 'malaria', 'moderate', 'fixture');
    const admission = await admissions.admit(ctx, { venueId: 'luth', facility: 'hospital-public', days: 3, reason: 'Malaria treatment', conditionRecordId: malaria.id });

    ctx.time += MINUTES_PER_DAY;
    await admissions.onTravel(ctx, ride('luth', character.locationId, ctx.time));

    expect(admission.status).toBe('left');
    expect(malaria.status).toBe('active');
  });
});

/** Roll natural death for up to 20,000 days at health 0; true if it ever happens. */
async function rollYears(age: number, present: boolean): Promise<boolean> {
  const { ctx, mortality } = setup({ age, health: 0 });
  if (present) playerActs(ctx);
  else playerAway(ctx);
  for (let day = 0; day < 20_000; day++) if (await mortality.checkNaturalDeath(ctx, day, [], false)) return true;
  return false;
}

describe('offline safety net', () => {
  it('never lets an inactive, broke Sapa Pikin die of severe malaria over 30 days (family pays once, then charity)', async () => {
    const { ctx, character, wallet, conditions, system } = setup({ age: 19, lifestyle: 'sapa', cash: 0, health: 60 });
    playerAway(ctx);
    await conditions.create(ctx, 'malaria', 'severe', 'fixture');

    // Keep the pressure on: whenever the malaria clears, it comes straight back, severe.
    await liveHealthDays(ctx, system, 30, async () => {
      if (!(await conditions.has(ctx, 'malaria'))) await conditions.create(ctx, 'malaria', 'severe', 'fixture');
    });

    expect(character.alive).toBe(true);
    expect(character.health).toBeGreaterThan(0);
    expect(wallet.receipts.filter((receipt) => receipt.kind === 'family-support')).toHaveLength(1);
    expect(ctx.notifications.filter((notification) => notification.title.startsWith('🚑 Your family rushed you to LUTH'))).toHaveLength(1);
    expect(ctx.notifications.some((notification) => notification.title.startsWith('🚑 Charity care at LUTH'))).toBe(true);
    expect(character.moodModifiers.some((modifier) => modifier.id === 'charity-ward') || character.connections < 5).toBe(true);
  });

  it('still lets an active player who ignores repeated warnings die of untreated critical illness', async () => {
    const { ctx, character, manager, conditions, system } = setup({ age: 22, lifestyle: 'sapa', cash: 0, health: 12 });
    await conditions.create(ctx, 'malaria', 'critical', 'fixture');

    await liveHealthDays(ctx, system, 10, () => playerActs(ctx));

    expect(character.alive).toBe(false);
    expect(character.causeOfDeath).toBe('Complications of severe malaria');
    expect(character.diedAt).toBeLessThanOrEqual(START + 5 * MINUTES_PER_DAY);
    const malaria = manager.rows(HealthConditionEntity)[0] as unknown as HealthConditionEntity;
    expect(malaria.warningsSeen).toBeGreaterThanOrEqual(2);
    expect(ctx.notifications.filter((notification) => notification.title.startsWith('🚨 Still critical')).length).toBeGreaterThanOrEqual(2);
  });

  it('gets the same critically ill player admitted instead once they go offline', async () => {
    const { ctx, character, manager, conditions, system } = setup({ age: 22, lifestyle: 'sapa', cash: 0, health: 12 });
    playerAway(ctx);
    await conditions.create(ctx, 'malaria', 'critical', 'fixture');

    await liveHealthDays(ctx, system, 10);

    expect(character.alive).toBe(true);
    expect(manager.rows(HospitalAdmissionEntity)).toHaveLength(1);
  });

  it('sends an unattended character to the cheapest effective care once an illness lingers', async () => {
    const { ctx, wallet, conditions, treatment } = setup({ age: 25, cash: 200_000 });
    playerAway(ctx);
    const malaria = await conditions.create(ctx, 'malaria', 'mild', 'fixture');
    const typhoid = await conditions.create(ctx, 'typhoid', 'moderate', 'fixture');
    malaria.onsetAt = START - 2 * MINUTES_PER_DAY;
    typhoid.onsetAt = START - MINUTES_PER_DAY;

    await treatment.autopilotCare(ctx, START / MINUTES_PER_DAY);

    const visits = wallet.payments.filter((payment) => payment.key.startsWith('autopilot-treatment:'));
    // Mild malaria is within the pharmacy's limits → pharmacy (₦3,000); moderate typhoid is beyond it → public hospital.
    expect(visits.find((payment) => payment.key.includes(malaria.id))?.amount).toBe(3_000);
    expect(visits.find((payment) => payment.key.includes(typhoid.id))?.amount).toBe(37_500);
  });

  it('leaves fresh mild illness alone, and does nothing while the player is watching', async () => {
    const { ctx, wallet, conditions, treatment } = setup({ age: 25, cash: 200_000 });
    await conditions.create(ctx, 'malaria', 'mild', 'fixture');
    const typhoid = await conditions.create(ctx, 'typhoid', 'moderate', 'fixture');
    typhoid.onsetAt = START - 3 * MINUTES_PER_DAY;

    playerAway(ctx);
    ctx.time = START + MINUTES_PER_DAY;
    await treatment.autopilotCare(ctx, START / MINUTES_PER_DAY);
    expect(wallet.payments.some((payment) => payment.key.includes('autopilot') && !payment.key.includes(typhoid.id))).toBe(false);

    const paidSoFar = wallet.payments.length;
    playerActs(ctx);
    await treatment.autopilotCare(ctx, START / MINUTES_PER_DAY + 1);
    expect(wallet.payments).toHaveLength(paidSoFar);
  });

  it('never takes a natural death before 55 while the player is away, but old age still can', async () => {
    expect(await rollYears(54, true)).toBe(true);
    expect(await rollYears(54, false)).toBe(false);
    expect(await rollYears(80, false)).toBe(true);
  });
});
