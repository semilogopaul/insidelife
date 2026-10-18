import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  findVenue,
  AIRCRAFT,
  AIRCRAFT_CLASS_INFO,
  AIRCRAFT_SALES_GAT,
  APRON_OTHERS_MAX,
  DEFAULT_LIVERY,
  FERRY_DELIVERY_MINUTES,
  GAT_IDS,
  GAT_NAMES,
  MAX_AIRCRAFT,
  MINUTES_PER_DAY,
  aircraftBrokerOffer,
  aircraftFerryFee,
  aircraftLocationId,
  aircraftLiveryFee,
  aircraftMarketValue,
  aircraftMonthlyCosts,
  aircraftNameFee,
  aircraftNameIssue,
  aircraftNeedsLicence,
  aircraftRegistrationFee,
  findAircraft,
  flightFuelCost,
  flightFuelLitres,
  flightMinutes,
  formatNaira,
  gatDistanceKm,
  isAircraftLocation,
  isGatId,
  isInterruptibleActivity,
  isValidLivery,
  normaliseAircraftName,
  normaliseRegistration,
  registrationIssue,
  type AircraftCatalogEntryDto,
  type AircraftBoardingResultDto,
  type AircraftChangeResultDto,
  type AircraftDefinition,
  type ApronDto,
  type ApronPlaneDto,
  type AircraftFlightOptionDto,
  type AircraftFlightResultDto,
  type AircraftPurchaseRequest,
  type AircraftPurchaseResultDto,
  type AircraftReinstatementResultDto,
  type AircraftSaleResultDto,
  type GatId,
  type HangarDto,
  type OwnedAircraftDto,
  type PilotTrainingDto,
} from '@insidelife/shared';
import { containsProfanity } from '../../common/moderation/profanity.js';
import { GameRuleException, InsufficientFundsException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { AIRCRAFT_DECOR_PORT, type AircraftDecorPort } from '../../common/ports/aircraft-decor.port.js';
import { CITY_TRAVEL_PORT, type CityTravelPort } from '../../common/ports/city-travel.port.js';
import type { RowProbe } from '../simulation/row-presence.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { AircraftEntity } from './entities/aircraft.entity.js';
import { PilotTrainingService } from './pilot-training.service.js';
import { boardBlocker, flyBlocker, randomRegistration } from './rules/aviation.rules.js';

/** A General Aviation Terminal planes can use: it exists in the world as an aviation terminal (Lagos and Abuja). */
const gatOpen = (venueId: string): boolean => findVenue(venueId)?.type === 'aviation-terminal';

/** Memo key for the character's fleet (invalidate after every change). */
export const FLEET_MEMO = 'aviation-fleet';
/** Most characters own no aircraft: the fleet read is skipped when there's no row (see `RowProbe`). */
export const FLEET_ROWS: RowProbe = { key: 'aviation:fleet', table: 'aircraft', where: 'character_id = $1' };

/** Serialises registration changes across all players (the registry is global). */
const REGISTRY_LOCK = "SELECT pg_advisory_xact_lock(hashtext('aircraft-registry'))";

/** Secondary aircraft add this share of their prestige. */
const SECONDARY_STATUS = 0.25;

interface ApronRow {
  readonly id: string;
  readonly aircraftId: string;
  readonly callName: string | null;
  readonly registration: string;
  readonly liveryBase: string;
  readonly liveryAccent: string;
  readonly ownerHandle: string;
  readonly friend: boolean;
  readonly present: boolean;
}

/** An owned aircraft resolved against the catalog. */
export interface FleetAircraft {
  readonly row: AircraftEntity;
  readonly def: AircraftDefinition;
}

/**
 * The hangar: buying (in person at the GAT sales desk, or remotely with a ferry delivery), liveries, names and
 * registrations, selling back, month-end bills and grounding, and flying between the GATs.
 */
@Injectable()
export class AviationService {
  private readonly logger = new Logger(AviationService.name);

  constructor(
    @Inject(CITY_TRAVEL_PORT) private readonly cities: CityTravelPort,
    @Inject(AIRCRAFT_DECOR_PORT) private readonly cabinDecor: AircraftDecorPort,
    private readonly training: PilotTrainingService,
    private readonly engine: SimulationEngine,
  ) {}

  // ----- Reads -----------------------------------------------------------------------------------------------------

  async fleet(ctx: SimulationContext): Promise<readonly FleetAircraft[]> {
    return ctx.memo(FLEET_MEMO, async () => {
      if (!(await ctx.mayHaveRows(FLEET_ROWS))) return [];
      const rows = await ctx.manager.find(AircraftEntity, { where: { characterId: ctx.character.id }, order: { acquiredAt: 'ASC' } });
      const planes: FleetAircraft[] = [];
      for (const row of rows) {
        const def = findAircraft(row.aircraftId);
        if (def) planes.push({ row, def });
        else this.logger.warn(`Aircraft ${row.id} references unknown catalog id ${row.aircraftId}`);
      }
      return planes;
    });
  }

  async find(ctx: SimulationContext, id: string): Promise<FleetAircraft> {
    const plane = (await this.fleet(ctx)).find(({ row }) => row.id === id);
    if (!plane) throw new ResourceNotFoundException('Aircraft');
    return plane;
  }

  /** Whether the character is standing in a GAT (not travelling), and which. */
  atGat(ctx: SimulationContext): GatId | null {
    const { locationId, travel } = ctx.character;
    return !travel && isGatId(locationId) ? locationId : null;
  }

  value(ctx: SimulationContext, plane: FleetAircraft): number {
    const ageDays = (ctx.time - plane.row.acquiredAt) / MINUTES_PER_DAY;
    return aircraftMarketValue(plane.def, ageDays, ctx.world.economy(ctx.time).priceIndex);
  }

  saleOffer(ctx: SimulationContext, plane: FleetAircraft): number {
    const roll = ctx.rng('aircraft-offer', plane.row.id, Math.floor(ctx.time / MINUTES_PER_DAY)).next();
    return aircraftBrokerOffer(this.value(ctx, plane), roll);
  }

  airborne(ctx: SimulationContext, plane: FleetAircraft): boolean {
    return plane.row.arrivesAt !== null && plane.row.arrivesAt > ctx.time;
  }

  // ----- The apron -------------------------------------------------------------------------------------------------

  /**
   * Other players' planes parked at a GAT, for the apron: friends' planes first, then those of players standing in the
   * terminal (your instance); at most `APRON_OTHERS_MAX` are drawn, every other plane parked here is "in a hangar" (a
   * head count only). Owners you blocked (or who blocked you), hidden or dead characters and planes in the air or grounded
   * are left out. Only the public handle of an owner is revealed.
   */
  async apron(ctx: SimulationContext, gat: string): Promise<ApronDto> {
    if (!isGatId(gat)) throw new ResourceNotFoundException('Terminal');
    const viewer = ctx.character.id;
    const rows: ApronRow[] = await ctx.manager.query(
      `SELECT a.id, a.aircraft_id AS "aircraftId", a.call_name AS "callName", a.registration,
              a.livery_base AS "liveryBase", a.livery_accent AS "liveryAccent", c.handle AS "ownerHandle",
              EXISTS (SELECT 1 FROM social_friendships f
                       WHERE f.status = 'accepted'
                         AND ((f.requester_id = $2 AND f.addressee_id = c.id) OR (f.addressee_id = $2 AND f.requester_id = c.id))) AS friend,
              (c.location_id = $1 AND c.travel IS NULL) AS present
         FROM aircraft a
         JOIN characters c ON c.id = a.character_id
        WHERE a.parked_at = $1 AND a.character_id <> $2 AND a.grounded_at IS NULL
          AND (a.arrives_at IS NULL OR a.arrives_at <= $3)
          AND c.alive AND c.hidden_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM social_blocks b
                           WHERE (b.blocker_id = $2 AND b.blocked_id = c.id) OR (b.blocker_id = c.id AND b.blocked_id = $2))
        ORDER BY friend DESC, present DESC, a.acquired_at ASC, a.id ASC
        LIMIT 200`,
      [gat, viewer, ctx.time],
    );
    const known = rows.filter((row) => row.friend || row.present);
    const planes: ApronPlaneDto[] = [];
    for (const row of known) {
      const def = findAircraft(row.aircraftId);
      if (!def || planes.length >= APRON_OTHERS_MAX) continue;
      planes.push({
        id: row.id,
        aircraftId: def.id,
        aircraftClass: def.class,
        liveryBase: row.liveryBase,
        liveryAccent: row.liveryAccent,
        callName: row.callName,
        registration: row.registration,
        ownerHandle: row.ownerHandle,
        relation: row.friend ? 'friend' : 'present',
      });
    }
    return { gat, planes, hangared: rows.length - planes.length };
  }

  // ----- Purchase --------------------------------------------------------------------------------------------------

  async purchase(ctx: SimulationContext, request: AircraftPurchaseRequest): Promise<AircraftPurchaseResultDto> {
    this.assertAlive(ctx);
    const licenceHeld = await this.training.held(ctx);
    const def = findAircraft(request.aircraftId);
    if (!def) throw new ResourceNotFoundException('Aircraft');
    if ((await this.fleet(ctx)).length >= MAX_AIRCRAFT) {
      throw new GameRuleException('HANGAR_FULL', `You can keep at most ${MAX_AIRCRAFT} aircraft. Sell one first`);
    }
    const livery = { base: request.liveryBase ?? DEFAULT_LIVERY.base, accent: request.liveryAccent ?? DEFAULT_LIVERY.accent };
    if (!isValidLivery(livery)) throw new GameRuleException('LIVERY_UNAVAILABLE', 'That paint isn’t in the palette');
    const callName = request.name === undefined || request.name.trim() === '' ? null : this.checkedName(request.name);

    const inPerson = this.atGat(ctx) === AIRCRAFT_SALES_GAT;
    const deliverTo = inPerson ? AIRCRAFT_SALES_GAT : (request.deliverTo ?? AIRCRAFT_SALES_GAT);
    if (!isGatId(deliverTo)) throw new GameRuleException('NO_SUCH_TERMINAL', 'Pick a General Aviation Terminal to deliver to');
    if (!gatOpen(deliverTo)) {
      throw new GameRuleException('CITY_NOT_OPEN', `${GAT_NAMES[deliverTo]} isn’t open yet. Deliver to Lagos for now`);
    }

    const price = ctx.world.price(def.price, ctx.time);
    const ferryFee = inPerson ? 0 : ctx.world.price(aircraftFerryFee(def), ctx.time);
    if (!ctx.wallet.canAfford(price + ferryFee)) throw new InsufficientFundsException(price + ferryFee);

    await ctx.manager.query(REGISTRY_LOCK);
    const registration = await this.pickRegistration(ctx, request.registration);
    const row = await ctx.manager.save(
      ctx.manager.create(AircraftEntity, {
        characterId: ctx.character.id,
        aircraftId: def.id,
        callName,
        registration,
        liveryBase: livery.base,
        liveryAccent: livery.accent,
        purchasePrice: price,
        acquiredAt: ctx.time,
        parkedAt: deliverTo,
        arrivesAt: inPerson ? null : ctx.time + FERRY_DELIVERY_MINUTES,
        groundedAt: null,
        arrears: 0,
        reinstatements: 0,
      }),
    );
    const metadata = { aircraftId: def.id, registration, deliverTo };
    await ctx.wallet.pay(price, 'purchase', `${def.name} (${registration})`, `aircraft-purchase:${row.id}`, { metadata });
    if (ferryFee > 0) await ctx.wallet.pay(ferryFee, 'fee', `Ferry flight: ${def.name} (${registration})`, `aircraft-purchase:${row.id}:ferry`, { sink: 'fees', metadata });
    this.changed(ctx);

    ctx.notify(
      inPerson
        ? { kind: 'achievement', title: 'Wheels up soon ✈️', body: `The keys to ${registration}, your ${def.name}, are yours. It’s parked at ${GAT_NAMES[AIRCRAFT_SALES_GAT]}.`, tone: 'good' }
        : { kind: 'system', title: 'Aircraft on its way 🛫', body: `A ferry crew is flying ${registration}, your ${def.name}, to ${GAT_NAMES[deliverTo]}. It lands in ${Math.round(FERRY_DELIVERY_MINUTES / MINUTES_PER_DAY)} days.`, tone: 'neutral' },
    );
    const plane = (await this.fleet(ctx)).find((candidate) => candidate.row.id === row.id) ?? { row, def };
    return { channel: inPerson ? 'in-person' : 'delivery', aircraft: this.toDto(ctx, plane, licenceHeld), price, ferryFee, balance: ctx.wallet.cash };
  }

  async sell(ctx: SimulationContext, id: string): Promise<AircraftSaleResultDto> {
    const plane = await this.find(ctx, id);
    if (this.airborne(ctx, plane)) throw new GameRuleException('IN_THE_AIR', 'Wait for it to land before you sell it');
    // Sitting in it when it goes: you are put back on the terminal floor.
    if (ctx.character.locationId === aircraftLocationId(plane.row.id)) ctx.character.locationId = plane.row.parkedAt;
    const amount = this.saleOffer(ctx, plane);
    const arrears = plane.row.arrears;
    // Whatever was fitted in the cabin goes back to the owner's decor inventory.
    await this.cabinDecor.releaseAircraft(ctx, plane.row.id);
    await ctx.manager.delete(AircraftEntity, { id: plane.row.id });
    this.changed(ctx);
    await ctx.wallet.receive(amount, 'sale', `Sold ${plane.def.name} (${plane.row.registration}) to a broker`, `aircraft-sale:${plane.row.id}`, {
      income: 'neutral',
      metadata: { aircraftId: plane.def.id, registration: plane.row.registration },
    });
    const settled = Math.min(arrears, amount);
    if (settled > 0) {
      await ctx.wallet.pay(settled, 'fee', `Unpaid bills settled on sale: ${plane.row.registration}`, `aircraft-sale:${plane.row.id}:arrears`, { sink: 'fees' });
    }
    return { aircraftId: plane.def.id, registration: plane.row.registration, amount, arrearsSettled: settled, balance: ctx.wallet.cash };
  }

  // ----- Make it yours ---------------------------------------------------------------------------------------------

  async setLivery(ctx: SimulationContext, id: string, base: string, accent: string): Promise<AircraftChangeResultDto> {
    this.assertAlive(ctx);
    const licenceHeld = await this.training.held(ctx);
    const plane = await this.find(ctx, id);
    if (!isValidLivery({ base, accent })) throw new GameRuleException('LIVERY_UNAVAILABLE', 'That paint isn’t in the palette');
    if (plane.row.liveryBase === base && plane.row.liveryAccent === accent) throw new GameRuleException('NOTHING_TO_CHANGE', 'It already wears those colours');
    const fee = ctx.world.price(aircraftLiveryFee(plane.def), ctx.time);
    await ctx.wallet.pay(fee, 'fee', `Repaint: ${plane.def.name} (${plane.row.registration})`, `aircraft-livery:${plane.row.id}:${ctx.time}`, { sink: 'fees', refuseRepeat: 'Hold on, the paint shop is still on your last order' });
    plane.row.liveryBase = base;
    plane.row.liveryAccent = accent;
    await ctx.manager.save(plane.row);
    this.changed(ctx);
    return { aircraft: this.toDto(ctx, plane, licenceHeld), fee, balance: ctx.wallet.cash };
  }

  async setName(ctx: SimulationContext, id: string, name: string): Promise<AircraftChangeResultDto> {
    this.assertAlive(ctx);
    const licenceHeld = await this.training.held(ctx);
    const plane = await this.find(ctx, id);
    const callName = this.checkedName(name);
    if (plane.row.callName === callName) throw new GameRuleException('NOTHING_TO_CHANGE', 'That name is already painted on it');
    const fee = ctx.world.price(aircraftNameFee(plane.def), ctx.time);
    await ctx.wallet.pay(fee, 'fee', `Fuselage name “${callName}”: ${plane.row.registration}`, `aircraft-name:${plane.row.id}:${ctx.time}`, { sink: 'fees', refuseRepeat: 'Hold on, the paint shop is still on your last order' });
    plane.row.callName = callName;
    await ctx.manager.save(plane.row);
    this.changed(ctx);
    return { aircraft: this.toDto(ctx, plane, licenceHeld), fee, balance: ctx.wallet.cash };
  }

  async setRegistration(ctx: SimulationContext, id: string, input: string): Promise<AircraftChangeResultDto> {
    this.assertAlive(ctx);
    const licenceHeld = await this.training.held(ctx);
    const plane = await this.find(ctx, id);
    await ctx.manager.query(REGISTRY_LOCK);
    const registration = await this.checkedRegistration(ctx, input, plane.row.id);
    if (registration === plane.row.registration) throw new GameRuleException('NOTHING_TO_CHANGE', 'That is already its registration');
    const fee = ctx.world.price(aircraftRegistrationFee(plane.def), ctx.time);
    await ctx.wallet.pay(fee, 'fee', `Re-registration ${plane.row.registration} to ${registration}`, `aircraft-registration:${plane.row.id}:${ctx.time}`, { sink: 'fees', refuseRepeat: 'Hold on, the registry is still on your last request' });
    plane.row.registration = registration;
    await ctx.manager.save(plane.row);
    this.changed(ctx);
    return { aircraft: this.toDto(ctx, plane, licenceHeld), fee, balance: ctx.wallet.cash };
  }

  // ----- Flying ----------------------------------------------------------------------------------------------------

  async fly(ctx: SimulationContext, id: string, destination: string): Promise<AircraftFlightResultDto> {
    this.assertAlive(ctx);
    const licenceHeld = await this.training.held(ctx);
    const plane = await this.find(ctx, id);
    const blocker = this.blocker(ctx, plane, licenceHeld);
    if (blocker) throw new GameRuleException('CANNOT_FLY', blocker);
    if (ctx.character.activity && !isInterruptibleActivity(ctx.character.activity)) {
      throw new GameRuleException('BUSY', 'You’re busy. Finish that before you head to the aircraft');
    }
    if (!isGatId(destination) || destination === plane.row.parkedAt) throw new GameRuleException('NO_SUCH_TERMINAL', 'Pick the other General Aviation Terminal');
    if (!gatOpen(destination)) throw new GameRuleException('CITY_NOT_OPEN', `${GAT_NAMES[destination]} isn’t open yet`);
    const km = gatDistanceKm(plane.row.parkedAt, destination);
    if (km > plane.def.rangeKm) throw new GameRuleException('OUT_OF_RANGE', `That is ${km} km; the ${plane.def.name} manages ${plane.def.rangeKm} km`);

    const minutes = flightMinutes(plane.def, km);
    const fuelCost = flightFuelCost(plane.def, km, ctx.world.economy(ctx.time).fuelPrice);
    await ctx.wallet.pay(fuelCost, 'transport', `Fuel ${plane.def.fuelType === 'avgas' ? 'AVGAS' : 'Jet A-1'}: ${plane.row.registration} to ${GAT_NAMES[destination]}`, `aircraft-fuel:${plane.row.id}:${ctx.time}`, {
      refuseRepeat: 'The fuel truck is still at your aircraft. Give it a moment',
      metadata: { aircraftId: plane.def.id, from: plane.row.parkedAt, to: destination, km, litres: flightFuelLitres(plane.def, km) },
    });
    // The travel module flies the character there and lands them in the other city's terminal at the arrival minute.
    await this.cities.relocateToCity(ctx, destination, ctx.time + minutes, `${plane.row.registration} · ${plane.def.name}`);
    plane.row.parkedAt = destination;
    plane.row.arrivesAt = ctx.time + minutes;
    await ctx.manager.save(plane.row);
    this.changed(ctx);
    return { aircraft: this.toDto(ctx, plane, licenceHeld), fuelCost, minutes, arrivesAt: ctx.time + minutes, balance: ctx.wallet.cash };
  }

  // ----- Boarding --------------------------------------------------------------------------------------------------

  /** The aircraft of yours the character is sitting in (their location is its `aircraft:<id>`), if any. */
  async aboardPlane(ctx: SimulationContext): Promise<FleetAircraft | null> {
    if (ctx.character.travel || !isAircraftLocation(ctx.character.locationId)) return null;
    return (await this.fleet(ctx)).find(({ row }) => ctx.character.locationId === aircraftLocationId(row.id)) ?? null;
  }

  /**
   * Step aboard your own parked aircraft from its terminal. The character's location becomes `aircraft:<id>`: the cabin
   * (with your decor) is the room you are in, and `fly` works from it. Boarding twice is a no-op.
   */
  async board(ctx: SimulationContext, id: string): Promise<AircraftBoardingResultDto> {
    this.assertAlive(ctx);
    const licenceHeld = await this.training.held(ctx);
    const plane = await this.find(ctx, id);
    const character = ctx.character;
    if (character.locationId !== aircraftLocationId(plane.row.id)) {
      const blocker = boardBlocker({
        aircraftId: plane.row.id,
        parkedAt: plane.row.parkedAt,
        arrivesAt: plane.row.arrivesAt,
        now: ctx.time,
        locationId: character.locationId,
        travelling: character.travel !== null,
      });
      if (blocker) throw new GameRuleException('CANNOT_BOARD', blocker);
      if (character.activity && !isInterruptibleActivity(character.activity)) {
        throw new GameRuleException('BUSY', 'You’re busy. Finish that before you head to the aircraft');
      }
      character.activity = null;
      character.locationId = aircraftLocationId(plane.row.id);
      // Like any place you walk into on purpose: the autopilot leaves you be for a while.
      this.engine.hangAround(ctx, ctx.time);
    }
    return { aircraft: this.toDto(ctx, plane, licenceHeld), aboard: true, locationId: character.locationId };
  }

  /** Step out of your aircraft onto the terminal floor (its GAT). Stepping out when you are not aboard is a no-op. */
  async deplane(ctx: SimulationContext, id: string): Promise<AircraftBoardingResultDto> {
    this.assertAlive(ctx);
    const licenceHeld = await this.training.held(ctx);
    const plane = await this.find(ctx, id);
    const character = ctx.character;
    if (character.locationId === aircraftLocationId(plane.row.id)) {
      if (character.travel) throw new GameRuleException('IN_THE_AIR', 'Stay in your seat until you land');
      character.activity = null;
      character.locationId = plane.row.parkedAt;
      this.engine.hangAround(ctx, ctx.time);
    }
    return { aircraft: this.toDto(ctx, plane, licenceHeld), aboard: false, locationId: character.locationId };
  }

  // ----- Unpaid bills ----------------------------------------------------------------------------------------------

  /** Pay the arrears and put a grounded aircraft back on the line. */
  async reinstate(ctx: SimulationContext, id: string): Promise<AircraftReinstatementResultDto> {
    this.assertAlive(ctx);
    const licenceHeld = await this.training.held(ctx);
    const plane = await this.find(ctx, id);
    if (plane.row.groundedAt === null && plane.row.arrears === 0) throw new GameRuleException('NOT_GROUNDED', 'Nothing to settle: it’s cleared to fly');
    const paid = plane.row.arrears;
    await ctx.wallet.pay(paid, 'fee', `Back bills settled: ${plane.row.registration}`, `aircraft-reinstate:${plane.row.id}:${plane.row.reinstatements}`, { sink: 'fees' });
    plane.row.arrears = 0;
    plane.row.groundedAt = null;
    plane.row.reinstatements += 1;
    await ctx.manager.save(plane.row);
    this.changed(ctx);
    return { aircraft: this.toDto(ctx, plane, licenceHeld), paid, balance: ctx.wallet.cash };
  }

  /**
   * Month-end: hangar, maintenance and (jets) crew per aircraft. If the whole bill can't be paid, the aircraft is
   * grounded and the bill goes on its arrears; a grounded aircraft keeps running up its bills.
   */
  async chargeMonthly(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    for (const plane of await this.fleet(ctx)) {
      const costs = aircraftMonthlyCosts(plane.def, this.value(ctx, plane), priceIndex);
      const label = `${plane.def.name} (${plane.row.registration})`;
      const key = `aircraft-month:${plane.row.id}:${monthIndex}`;
      if (!ctx.wallet.canAfford(costs.total)) {
        plane.row.arrears += costs.total;
        if (plane.row.groundedAt === null) plane.row.groundedAt = ctx.time;
        await ctx.manager.save(plane.row);
        this.changed(ctx);
        ctx.notify({
          kind: 'bill',
          title: 'Aircraft grounded 🛑',
          body: `You couldn’t cover ${formatNaira(costs.total)} for ${label}: hangar, maintenance${costs.crew > 0 ? ' and crew' : ''}. It’s grounded until you settle ${formatNaira(plane.row.arrears)} in the Hangar app.`,
          tone: 'bad',
        });
        continue;
      }
      await ctx.wallet.tryPay(costs.hangar, 'fee', `Hangar fee: ${label}`, `${key}:hangar`, { sink: 'fees' });
      await ctx.wallet.tryPay(costs.maintenance, 'transport', `Aircraft maintenance: ${label}`, `${key}:maintenance`);
      await ctx.wallet.tryPay(costs.crew, 'fee', `Flight crew salaries: ${label}`, `${key}:crew`, { sink: 'fees' });
      ctx.report({ label: `Hangar, maintenance${costs.crew > 0 ? ' and crew' : ''} (${plane.row.registration})`, amount: -costs.total, tone: 'neutral' });
    }
  }

  /** Every settle: tell the owner when a ferried aircraft has landed at its terminal, and clear finished flights. */
  async landDue(ctx: SimulationContext): Promise<void> {
    const due = (await this.fleet(ctx)).filter(({ row }) => row.arrivesAt !== null && row.arrivesAt <= ctx.time);
    if (due.length === 0) return;
    for (const plane of due) {
      // A ferry lands exactly one delivery period after purchase; a flight you were aboard needs no announcement.
      const ferried = plane.row.arrivesAt === plane.row.acquiredAt + FERRY_DELIVERY_MINUTES;
      plane.row.arrivesAt = null;
      await ctx.manager.save(plane.row);
      if (ferried) {
        ctx.notify({ kind: 'system', title: 'Your aircraft has landed 🛬', body: `${plane.row.registration}, your ${plane.def.name}, is on the apron at ${GAT_NAMES[plane.row.parkedAt as GatId] ?? 'its terminal'}.`, tone: 'good' });
        ctx.report({ label: `${plane.def.name} delivered`, tone: 'good' });
      }
    }
    this.changed(ctx);
  }

  // ----- Valuation -------------------------------------------------------------------------------------------------

  async netWorth(ctx: SimulationContext): Promise<number> {
    let total = 0;
    for (const plane of await this.fleet(ctx)) total += this.value(ctx, plane);
    return total;
  }

  /** The best aircraft in full, the others at a quarter. */
  async status(ctx: SimulationContext): Promise<number> {
    const prestige = (await this.fleet(ctx)).map(({ def }) => AIRCRAFT_CLASS_INFO[def.class].status).toSorted((a, b) => b - a);
    return Math.round(prestige.reduce((sum, value, index) => sum + (index === 0 ? value : value * SECONDARY_STATUS), 0));
  }

  // ----- Views -----------------------------------------------------------------------------------------------------

  async view(ctx: SimulationContext, training: PilotTrainingDto): Promise<HangarDto> {
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    const fuelPrice = ctx.world.economy(ctx.time).fuelPrice;
    const standing = this.atGat(ctx);
    const aboard = await this.aboardPlane(ctx);
    // Aboard your plane you are, for the app's purposes, at its terminal.
    const atGat = standing ?? (aboard ? (aboard.row.parkedAt as GatId) : null);
    const licenceHeld = training.licence;
    const catalogue: AircraftCatalogEntryDto[] = AIRCRAFT.map((aircraft) => {
      const price = ctx.world.price(aircraft.price, ctx.time);
      const costs = aircraftMonthlyCosts(aircraft, price, priceIndex);
      return {
        aircraft,
        price,
        ferryFee: ctx.world.price(aircraftFerryFee(aircraft), ctx.time),
        monthly: costs,
        routeFuelCost: flightFuelCost(aircraft, gatDistanceKm('mmia-gat', 'naia-gat'), fuelPrice),
        routeMinutes: flightMinutes(aircraft, gatDistanceKm('mmia-gat', 'naia-gat')),
        canFly: !aircraftNeedsLicence(aircraft) || licenceHeld,
        buyHere: standing === AIRCRAFT_SALES_GAT,
      };
    });
    const mine = (await this.fleet(ctx)).map((plane) => this.toDto(ctx, plane, licenceHeld));
    return { catalogue, mine, training, atGat, fleetLimit: MAX_AIRCRAFT };
  }

  toDto(ctx: SimulationContext, plane: FleetAircraft, licenceHeld: boolean): OwnedAircraftDto {
    const { row, def } = plane;
    const economy = ctx.world.economy(ctx.time);
    const value = this.value(ctx, plane);
    const flights: AircraftFlightOptionDto[] = GAT_IDS.filter((gat) => gat !== row.parkedAt).map((destination) => {
      const km = gatDistanceKm(row.parkedAt, destination);
      return {
        destination,
        km,
        minutes: flightMinutes(def, km),
        fuelLitres: flightFuelLitres(def, km),
        fuelCost: flightFuelCost(def, km, economy.fuelPrice),
        open: gatOpen(destination),
      };
    });
    return {
      id: row.id,
      aircraftId: def.id,
      name: def.name,
      aircraftClass: def.class,
      callName: row.callName,
      registration: row.registration,
      liveryBase: row.liveryBase,
      liveryAccent: row.liveryAccent,
      purchasePrice: row.purchasePrice,
      value,
      saleOffer: this.airborne(ctx, plane) ? 0 : this.saleOffer(ctx, plane),
      acquiredAt: row.acquiredAt,
      parkedAt: row.parkedAt as GatId,
      arrivesAt: this.airborne(ctx, plane) ? row.arrivesAt : null,
      airborne: this.airborne(ctx, plane),
      grounded: row.groundedAt !== null,
      arrears: row.arrears,
      monthly: aircraftMonthlyCosts(def, value, economy.priceIndex),
      liveryFee: ctx.world.price(aircraftLiveryFee(def), ctx.time),
      nameFee: ctx.world.price(aircraftNameFee(def), ctx.time),
      registrationFee: ctx.world.price(aircraftRegistrationFee(def), ctx.time),
      flyBlocker: this.blocker(ctx, plane, licenceHeld),
      flights,
    };
  }

  // ----- Internals -------------------------------------------------------------------------------------------------

  private blocker(ctx: SimulationContext, plane: FleetAircraft, licenceHeld: boolean): string | null {
    return flyBlocker({
      aircraft: plane.def,
      aircraftId: plane.row.id,
      parkedAt: plane.row.parkedAt,
      arrivesAt: plane.row.arrivesAt,
      grounded: plane.row.groundedAt !== null,
      now: ctx.time,
      locationId: ctx.character.locationId,
      travelling: ctx.character.travel !== null,
      licenceHeld,
    });
  }

  private checkedName(name: string): string {
    const issue = aircraftNameIssue(name);
    if (issue) throw new GameRuleException('BAD_NAME', issue);
    const callName = normaliseAircraftName(name);
    if (containsProfanity(callName)) throw new GameRuleException('BAD_NAME', 'The airport authority won’t paint that on a fuselage');
    return callName;
  }

  /** A valid, free `5N-XXX`: the one asked for, or a seeded random one. */
  private async pickRegistration(ctx: SimulationContext, requested: string | undefined): Promise<string> {
    if (requested !== undefined && requested.trim() !== '') return this.checkedRegistration(ctx, requested, null);
    for (let attempt = 0; attempt < 60; attempt++) {
      const candidate = randomRegistration(ctx.rng('aircraft-registration', ctx.time, attempt));
      if (!(await this.registrationTaken(ctx, candidate, null))) return candidate;
    }
    throw new GameRuleException('REGISTRY_BUSY', 'The registry is swamped. Try again in a moment');
  }

  private async checkedRegistration(ctx: SimulationContext, input: string, ownId: string | null): Promise<string> {
    const issue = registrationIssue(input);
    if (issue) throw new GameRuleException('BAD_REGISTRATION', issue);
    const registration = normaliseRegistration(input)!;
    if (await this.registrationTaken(ctx, registration, ownId)) throw new GameRuleException('REGISTRATION_TAKEN', `${registration} is already on another aircraft`);
    return registration;
  }

  private async registrationTaken(ctx: SimulationContext, registration: string, ownId: string | null): Promise<boolean> {
    const found = await ctx.manager.findOne(AircraftEntity, { where: { registration }, select: { id: true } });
    return found !== null && found.id !== ownId;
  }

  private assertAlive(ctx: SimulationContext): void {
    if (!ctx.character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
  }

  changed(ctx: SimulationContext): void {
    ctx.invalidate(FLEET_MEMO);
  }
}
