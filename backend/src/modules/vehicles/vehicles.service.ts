import { Injectable, Logger } from '@nestjs/common';
import {
  BASELINE_CONDITION,
  FUEL_EMPTY_LITRES,
  FUEL_LOW_SHARE,
  JERRYCAN,
  MAX_VEHICLES,
  NEW_CAR_FUEL_SHARE,
  ROADSIDE_MECHANIC,
  VEHICLE_SERVICE_SOON_CONDITION,
  VEHICLE_WEAR_PER_KM,
  breakdownChancePerKm,
  canDriveVehicle,
  crashWear,
  dailyWearFor,
  fuelRangeKm,
  fuelTankLitres,
  jerrycanPrice,
  litresForKm,
  pumpPricePerLitre,
  roadsideRepairCost,
  towRepairCost,
  workshopRepairCost,
  MINUTES_PER_DAY,
  VEHICLES,
  VEHICLE_DELIVERY_FEE,
  VEHICLE_PAINTS,
  VENUES,
  dealerStocks,
  findVehicle,
  findVenue,
  formatNaira,
  isVehiclePaintId,
  paintSurcharge,
  startOfDay,
  toDateParts,
  vehiclePaint,
  type DriverLicenceDto,
  type DrivenVehicleDto,
  type JerrycanResultDto,
  type OwnedVehicleDto,
  type VehicleCatalogEntryDto,
  type VehicleDefinition,
  type VehiclePurchaseResultDto,
  type VehicleRepairResultDto,
  type VehicleSaleResultDto,
  type VehiclesDto,
} from '@insidelife/shared';
import { GameRuleException, InsufficientFundsException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { OwnedVehicleEntity } from './entities/owned-vehicle.entity.js';
import {
  currentValue,
  dealerHere,
  dealerOffer,
  monthlyMaintenance,
  plateNumber,
  SERVICE_BONUS,
  SKIPPED_SERVICE_WEAR,
  startingMileage,
  vehicleConditionNow,
  type BuyerPosition,
} from './rules/vehicle.rules.js';

/** Memo key for the character's cars (invalidate after every change). */
export const GARAGE_MEMO = 'vehicles-garage';
const ITEM_TAGS_MEMO = 'item-tags';

/** An owned car resolved against the catalog. */
export interface GarageCar {
  readonly row: OwnedVehicleEntity;
  readonly def: VehicleDefinition;
}

const DEALER_IDS = VENUES.filter((venue) => venue.type === 'car-dealer').map((venue) => venue.id);

/**
 * The garage: buying (in person at a dealer, or remotely with delivery), primary car, selling back to a dealer,
 * repairs, valuation and the views the Motors app shows.
 */
@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  // ----- Reads -----------------------------------------------------------------------------------------------------

  async garage(ctx: SimulationContext): Promise<readonly GarageCar[]> {
    return ctx.memo(GARAGE_MEMO, async () => {
      const rows = await ctx.manager.find(OwnedVehicleEntity, { where: { characterId: ctx.character.id }, order: { acquiredAt: 'ASC' } });
      const cars: GarageCar[] = [];
      for (const row of rows) {
        const def = findVehicle(row.vehicleId);
        if (def) cars.push({ row, def });
        else this.logger.warn(`Owned vehicle ${row.id} references unknown catalog id ${row.vehicleId}`);
      }
      return cars;
    });
  }

  /** Cars delivered that will start and go: fuel in the tank, not broken down, in good enough shape. */
  async drivable(ctx: SimulationContext): Promise<readonly GarageCar[]> {
    return (await this.garage(ctx)).filter((car) => this.canDrive(ctx, car));
  }

  /** The car you drive: the primary one if it starts, else any car that starts. */
  async driving(ctx: SimulationContext): Promise<GarageCar | null> {
    const cars = await this.drivable(ctx);
    return cars.find((car) => car.row.isPrimary) ?? cars[0] ?? null;
  }

  /**
   * The car with you out on the street: your daily ride (the primary car) whatever state it's in — an empty or
   * broken-down car still stands at the kerb, and the pump or the mechanic serves that one, never a car at home —
   * else the first delivered car. Switch cars in Motors ("Drive this one").
   */
  async withYou(ctx: SimulationContext): Promise<GarageCar | null> {
    const owned = (await this.garage(ctx)).filter((car) => car.row.status === 'owned');
    return owned.find((car) => car.row.isPrimary) ?? owned[0] ?? null;
  }

  async find(ctx: SimulationContext, id: string): Promise<GarageCar> {
    const car = (await this.garage(ctx)).find(({ row }) => row.id === id);
    if (!car) throw new ResourceNotFoundException('Vehicle');
    return car;
  }

  condition(ctx: SimulationContext, car: GarageCar): number {
    return vehicleConditionNow(car.row.condition, car.row.conditionAt, ctx.time, dailyWearFor(car.def, toDateParts(ctx.time).year));
  }

  /** Litres in the tank (cars from before tanks existed count as full). */
  fuel(car: GarageCar): number {
    const tank = fuelTankLitres(car.def);
    return Math.max(0, Math.min(tank, car.row.fuelLitres ?? tank));
  }

  brokenDown(car: GarageCar): boolean {
    return car.row.brokenDownAt !== null;
  }

  canDrive(ctx: SimulationContext, car: GarageCar): boolean {
    return car.row.status === 'owned' && canDriveVehicle({ fuelLitres: this.fuel(car), condition: this.condition(ctx, car), brokenDown: this.brokenDown(car) });
  }

  /** Pump price per litre for this car right now (the world's petrol price, scarcity included; diesel costs more). */
  pumpPrice(ctx: SimulationContext, car: GarageCar): number {
    return pumpPricePerLitre(ctx.world.economy(ctx.time).fuelPrice, car.def.fuelType);
  }

  /** The car as the open world drives it (render look + running state). */
  driven(ctx: SimulationContext, car: GarageCar): DrivenVehicleDto {
    return {
      ownedVehicleId: car.row.id,
      vehicleId: car.def.id,
      name: car.def.name,
      model: car.def.model,
      color: VEHICLE_PAINTS[car.row.paint]?.hex ?? car.def.color,
      plate: car.row.plate,
      fuelType: car.def.fuelType,
      fuelEconomyKmPerLitre: car.def.fuelEconomyKmPerLitre,
      fuelLitres: Math.round(this.fuel(car) * 100) / 100,
      tankLitres: fuelTankLitres(car.def),
      condition: Math.round(this.condition(ctx, car) * 10) / 10,
      brokenDown: this.brokenDown(car),
    };
  }

  value(ctx: SimulationContext, car: GarageCar): number {
    return currentValue(car.def, car.row.acquiredAt, ctx.time, this.condition(ctx, car), ctx.world.economy(ctx.time).priceIndex);
  }

  saleOffer(ctx: SimulationContext, car: GarageCar): number {
    const roll = ctx.rng('vehicle-offer', car.row.id, Math.floor(ctx.time / MINUTES_PER_DAY)).next();
    return dealerOffer(this.value(ctx, car), roll);
  }

  // ----- Commands --------------------------------------------------------------------------------------------------

  async purchase(ctx: SimulationContext, vehicleId: string, colour?: string): Promise<VehiclePurchaseResultDto> {
    if (!ctx.character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    const def = findVehicle(vehicleId);
    if (!def) throw new ResourceNotFoundException('Vehicle');
    const paintId = colour ?? def.defaultPaint;
    if (!isVehiclePaintId(paintId) || !vehiclePaint(def, paintId)) {
      const options = def.paints.map((id) => VEHICLE_PAINTS[id].label.toLowerCase()).join(', ');
      throw new GameRuleException('PAINT_UNAVAILABLE', `${def.name} only comes in: ${options}`);
    }
    if ((await this.garage(ctx)).length >= MAX_VEHICLES) {
      throw new GameRuleException('GARAGE_FULL', `Your compound can only fit ${MAX_VEHICLES} cars — sell one first`);
    }

    const dealerId = dealerHere(this.position(ctx), def);
    const price = ctx.world.price(def.price, ctx.time);
    const paintFee = this.paintFee(ctx, def, paintId);
    const deliveryFee = dealerId ? 0 : ctx.world.price(VEHICLE_DELIVERY_FEE, ctx.time);
    if (!ctx.wallet.canAfford(price + paintFee + deliveryFee)) throw new InsufficientFundsException(price + paintFee + deliveryFee);

    const rng = ctx.rng('vehicle-purchase', def.id, ctx.time);
    const registeredIn = (dealerId ? findVenue(dealerId)?.districtId : undefined) ?? ctx.character.homeDistrictId;
    const hasPrimary = (await this.garage(ctx)).some(({ row }) => row.isPrimary);
    const row = await ctx.manager.save(
      ctx.manager.create(OwnedVehicleEntity, {
        characterId: ctx.character.id,
        vehicleId: def.id,
        paint: paintId,
        plate: plateNumber(registeredIn, rng),
        purchasePrice: price,
        condition: BASELINE_CONDITION[def.grade],
        conditionAt: ctx.time,
        mileageKm: startingMileage(def, rng),
        acquiredAt: ctx.time,
        isPrimary: dealerId !== null && !hasPrimary,
        status: dealerId ? 'owned' : 'in-transit',
        arrivesAt: dealerId ? null : startOfDay(ctx.time) + 2 * MINUTES_PER_DAY,
        lastDrivenAt: null,
        skippedServices: 0,
        fuelLitres: fuelTankLitres(def) * NEW_CAR_FUEL_SHARE,
        brokenDownAt: null,
      }),
    );

    const dealer = dealerId ? findVenue(dealerId)?.name : undefined;
    const metadata = { vehicleId: def.id, ownedVehicleId: row.id, plate: row.plate };
    await ctx.wallet.pay(price, 'purchase', `${def.name} (${def.nickname}) — ${dealer ?? 'remote purchase'}`, `vehicle-purchase:${row.id}`, { metadata });
    if (paintFee > 0) {
      await ctx.wallet.pay(paintFee, 'purchase', `${VEHICLE_PAINTS[paintId].label} paint: ${def.name}`, `vehicle-purchase:${row.id}:paint`, { metadata });
    }
    if (deliveryFee > 0) {
      await ctx.wallet.pay(deliveryFee, 'fee', `Car delivery: ${def.name}`, `vehicle-purchase:${row.id}:delivery`, { sink: 'fees', metadata });
    }
    this.changed(ctx);

    ctx.notify(
      dealer
        ? { kind: 'achievement', title: 'New whip! 🚗', body: `You drove a ${def.name} out of ${dealer}. Plate ${row.plate}. Get your FRSC licence before the police find you.`, tone: 'good' }
        : { kind: 'system', title: 'Car on the way 🚚', body: `The dealer's driver will bring your ${def.name} (${row.plate}) by tomorrow night.`, tone: 'neutral' },
    );
    const car = (await this.garage(ctx)).find((candidate) => candidate.row.id === row.id) ?? { row, def };
    return { channel: dealer ? 'in-person' : 'delivery', vehicle: this.toDto(ctx, car), price, paintFee, deliveryFee, balance: ctx.wallet.cash };
  }

  async setPrimary(ctx: SimulationContext, id: string): Promise<OwnedVehicleDto> {
    const car = await this.find(ctx, id);
    if (car.row.status !== 'owned') throw new GameRuleException('NOT_DELIVERED', `Your ${car.def.name} hasn’t been delivered yet`);
    for (const { row } of await this.garage(ctx)) {
      const primary = row.id === id;
      if (row.isPrimary === primary) continue;
      row.isPrimary = primary;
      await ctx.manager.save(row);
    }
    this.changed(ctx);
    return this.toDto(ctx, car);
  }

  async sell(ctx: SimulationContext, id: string): Promise<VehicleSaleResultDto> {
    const car = await this.find(ctx, id);
    if (car.row.status !== 'owned') throw new GameRuleException('NOT_DELIVERED', `Your ${car.def.name} hasn’t even arrived yet`);
    const amount = this.saleOffer(ctx, car);
    await ctx.manager.delete(OwnedVehicleEntity, { id: car.row.id });
    if (car.row.isPrimary) await this.promoteNextPrimary(ctx, car.row.id);
    this.changed(ctx);
    await ctx.wallet.receive(amount, 'refund', `Sold ${car.def.name} (${car.row.plate}) to a dealer`, `vehicle-sale:${car.row.id}`, {
      income: 'neutral',
      metadata: { vehicleId: car.def.id, plate: car.row.plate },
    });
    return { vehicleId: car.def.id, plate: car.row.plate, amount, balance: ctx.wallet.cash };
  }

  /** "Tow & fix" from the Motors app (anywhere): a tow truck to a workshop and a proper repair. */
  async repair(ctx: SimulationContext, id: string): Promise<VehicleRepairResultDto> {
    const car = await this.find(ctx, id);
    if (car.row.status !== 'owned') throw new GameRuleException('NOT_DELIVERED', `Your ${car.def.name} hasn’t been delivered yet`);
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    const cost = towRepairCost(car.def, this.condition(ctx, car), this.brokenDown(car), priceIndex);
    if (cost === 0) throw new GameRuleException('NOTHING_TO_REPAIR', `Your ${car.def.name} is in top shape`);
    await ctx.wallet.pay(cost, 'transport', `Tow & mechanic: ${car.def.name} (${car.row.plate})`, `vehicle-repair:${car.row.id}:${ctx.time}`);
    await this.restore(ctx, car);
    return { vehicle: this.toDto(ctx, car), cost, balance: ctx.wallet.cash };
  }

  /** A proper repair at a workshop on the street (the movement layer checked you're there). */
  async workshopRepair(ctx: SimulationContext, car: GarageCar, memo: string, key: string): Promise<number> {
    const cost = workshopRepairCost(car.def, this.condition(ctx, car), this.brokenDown(car), ctx.world.economy(ctx.time).priceIndex);
    if (cost === 0) throw new GameRuleException('NOTHING_TO_REPAIR', `Your ${car.def.name} is in top shape`);
    if (await ctx.wallet.pay(cost, 'transport', memo, key)) await this.restore(ctx, car);
    return cost;
  }

  /** Roadside mechanic (anywhere): gets it going again — breakdown cleared, patched up to 50 — at a premium. */
  async roadsideRepair(ctx: SimulationContext, id: string, idempotencyKey: string): Promise<VehicleRepairResultDto> {
    const car = await this.find(ctx, id);
    if (car.row.status !== 'owned') throw new GameRuleException('NOT_DELIVERED', `Your ${car.def.name} hasn’t been delivered yet`);
    const condition = this.condition(ctx, car);
    const cost = roadsideRepairCost(car.def, condition, this.brokenDown(car), ctx.world.economy(ctx.time).priceIndex);
    if (cost === 0) throw new GameRuleException('NOTHING_TO_REPAIR', `Your ${car.def.name} runs fine — a workshop can give it a proper service`);
    const applied = await ctx.wallet.pay(cost, 'transport', `Roadside mechanic: ${car.def.name} (${car.row.plate})`, `vehicle-roadside:${car.row.id}:${idempotencyKey}`);
    if (applied) {
      car.row.brokenDownAt = null;
      await this.setCondition(ctx, car, Math.max(condition, ROADSIDE_MECHANIC.patchTo));
    }
    return { vehicle: this.toDto(ctx, car), cost, balance: ctx.wallet.cash };
  }

  /** Buy fuel at a pump (the movement layer checked you're at the station). Litres put in (0 on a replayed key). */
  async refuel(ctx: SimulationContext, car: GarageCar, litres: number | null, memo: string, key: string): Promise<{ litres: number; pricePerLitre: number; cost: number }> {
    const room = fuelTankLitres(car.def) - this.fuel(car);
    const wanted = Math.min(room, litres ?? room);
    if (wanted < 0.5) throw new GameRuleException('TANK_FULL', `Your ${car.def.name}’s tank is full`);
    const pricePerLitre = this.pumpPrice(ctx, car);
    const amount = Math.round(wanted * 10) / 10;
    const cost = Math.round(amount * pricePerLitre);
    if (!ctx.wallet.canAfford(cost)) {
      const affordable = Math.floor((ctx.wallet.cash / pricePerLitre) * 10) / 10;
      throw new GameRuleException('INSUFFICIENT_FUNDS', affordable >= 1 ? `You can afford ${affordable} L right now` : 'You can’t afford fuel right now');
    }
    const applied = await ctx.wallet.pay(cost, 'transport', `${memo} (${amount.toFixed(1)}L)`, key, { metadata: { litres: amount, pricePerLitre } });
    if (applied) await this.addFuel(ctx, car, amount);
    return { litres: applied ? amount : 0, pricePerLitre, cost };
  }

  /** A 10 L jerrycan brought by an okada boy, anywhere (premium). */
  async jerrycan(ctx: SimulationContext, id: string, idempotencyKey: string): Promise<JerrycanResultDto> {
    const car = await this.find(ctx, id);
    if (car.row.status !== 'owned') throw new GameRuleException('NOT_DELIVERED', `Your ${car.def.name} hasn’t been delivered yet`);
    const litres = Math.round(Math.min(JERRYCAN.litres, fuelTankLitres(car.def) - this.fuel(car)) * 10) / 10;
    if (litres < 0.5) throw new GameRuleException('TANK_FULL', `Your ${car.def.name}’s tank is full`);
    const economy = ctx.world.economy(ctx.time);
    const cost = jerrycanPrice(economy.fuelPrice, car.def.fuelType, economy.priceIndex);
    const applied = await ctx.wallet.pay(cost, 'transport', `Jerrycan of fuel (${JERRYCAN.litres}L, delivered)`, `vehicle-jerrycan:${car.row.id}:${idempotencyKey}`);
    if (applied) await this.addFuel(ctx, car, litres);
    return { vehicle: this.toDto(ctx, car), litres: applied ? litres : 0, cost, balance: ctx.wallet.cash };
  }

  /** Put fuel in the tank (capped at its size). */
  async addFuel(ctx: SimulationContext, car: GarageCar, litres: number): Promise<void> {
    car.row.fuelLitres = Math.min(fuelTankLitres(car.def), this.fuel(car) + Math.max(0, litres));
    await ctx.manager.save(car.row);
    this.changed(ctx);
  }

  /** It breaks down where it stands (life events: abandoned on the expressway, a bodged roadside fix). */
  async breakDown(ctx: SimulationContext, car: GarageCar): Promise<void> {
    if (car.row.brokenDownAt !== null) return;
    car.row.brokenDownAt = ctx.time;
    await ctx.manager.save(car.row);
    this.changed(ctx);
  }

  /** A mechanic got it going (life events). */
  async clearBreakdown(ctx: SimulationContext, car: GarageCar): Promise<void> {
    if (car.row.brokenDownAt === null) return;
    car.row.brokenDownAt = null;
    await ctx.manager.save(car.row);
    this.changed(ctx);
  }

  /**
   * Drive `km` map km: burn fuel (more in go-slow), add mileage and wear (plus any crash damage), and roll for a
   * breakdown once per odometer km while the car is below the breakdown condition — seeded by car and km, so a drive
   * breaks down at the same place however the heartbeats batch it. Tells the player when the fuel light comes on,
   * the tank runs dry, the engine light comes on or the car dies.
   */
  async drive(ctx: SimulationContext, car: GarageCar, km: number, options: { readonly trafficFactor?: number; readonly bumps?: number } = {}): Promise<{ ranOut: boolean; brokeDown: boolean }> {
    const distance = Math.max(0, km);
    const tank = fuelTankLitres(car.def);
    const fuelBefore = this.fuel(car);
    const fuelAfter = Math.max(0, fuelBefore - litresForKm(car.def, distance, options.trafficFactor));
    const conditionBefore = this.condition(ctx, car);
    const conditionAfter = conditionBefore - distance * VEHICLE_WEAR_PER_KM - crashWear(options.bumps ?? 0);
    const odometer = car.row.mileageKm;
    let brokeDown = false;
    const chance = breakdownChancePerKm(conditionBefore);
    if (!this.brokenDown(car) && chance > 0) {
      const last = Math.min(Math.floor(odometer + distance), Math.floor(odometer) + 500);
      for (let mark = Math.floor(odometer) + 1; mark <= last; mark++) {
        if (ctx.rng('vehicle-breakdown', car.row.id, mark).chance(chance)) {
          brokeDown = true;
          break;
        }
      }
    }
    car.row.mileageKm = odometer + distance;
    car.row.lastDrivenAt = ctx.time;
    car.row.fuelLitres = fuelAfter;
    if (brokeDown) car.row.brokenDownAt = ctx.time;
    await this.setCondition(ctx, car, conditionAfter);

    const ranOut = fuelBefore > FUEL_EMPTY_LITRES && fuelAfter <= FUEL_EMPTY_LITRES;
    if (brokeDown) {
      ctx.notify({ kind: 'system', title: 'Your car broke down 🔧', body: `Your ${car.def.name} coughed and died. Call a mechanic, or push it to a workshop.`, tone: 'bad' });
    } else if (ranOut) {
      ctx.notify({ kind: 'system', title: 'Out of fuel ⛽', body: `Your ${car.def.name} ran dry. Push it to a filling station or order a jerrycan in Motors.`, tone: 'bad' });
    } else if (fuelBefore > tank * FUEL_LOW_SHARE && fuelAfter <= tank * FUEL_LOW_SHARE) {
      ctx.notify({ kind: 'system', title: 'Fuel light is on ⛽', body: `About ${Math.round(fuelRangeKm(car.def, fuelAfter))} km left in your ${car.def.name}. Find a filling station.`, tone: 'neutral' });
    }
    if (!brokeDown && conditionBefore >= VEHICLE_SERVICE_SOON_CONDITION && conditionAfter < VEHICLE_SERVICE_SOON_CONDITION) {
      ctx.notify({ kind: 'system', title: 'Engine light on 🔧', body: `Your ${car.def.name} needs a service soon. A mechanic workshop will sort it.`, tone: 'neutral' });
    }
    return { ranOut, brokeDown };
  }

  /** Back to 100, breakdown and missed services forgiven. */
  private async restore(ctx: SimulationContext, car: GarageCar): Promise<void> {
    car.row.skippedServices = 0;
    car.row.brokenDownAt = null;
    await this.setCondition(ctx, car, 100);
  }

  async setCondition(ctx: SimulationContext, car: GarageCar, condition: number): Promise<void> {
    car.row.condition = Math.max(0, Math.min(100, condition));
    car.row.conditionAt = ctx.time;
    await ctx.manager.save(car.row);
    this.changed(ctx);
  }

  /** Grant a car without payment (Nepo Baby starter, gifts); its value is recorded as unearned. */
  async grant(ctx: SimulationContext, vehicleId: string): Promise<void> {
    const def = findVehicle(vehicleId);
    if (!def) return;
    const rng = ctx.rng('vehicle-gift', def.id, ctx.time);
    const hasPrimary = (await this.garage(ctx)).some(({ row }) => row.isPrimary);
    await ctx.manager.save(
      ctx.manager.create(OwnedVehicleEntity, {
        characterId: ctx.character.id,
        vehicleId: def.id,
        paint: def.defaultPaint,
        plate: plateNumber(ctx.character.homeDistrictId, rng),
        purchasePrice: 0,
        condition: BASELINE_CONDITION[def.grade],
        conditionAt: ctx.time,
        mileageKm: startingMileage(def, rng),
        acquiredAt: ctx.time,
        isPrimary: !hasPrimary,
        status: 'owned',
        arrivesAt: null,
        lastDrivenAt: null,
        skippedServices: 0,
        fuelLitres: fuelTankLitres(def) * NEW_CAR_FUEL_SHARE,
        brokenDownAt: null,
      }),
    );
    this.changed(ctx);
    // A free car is unearned wealth at its market value (same value net worth counts).
    ctx.wallet.recordUnearnedAsset(currentValue(def, ctx.time, ctx.time, BASELINE_CONDITION[def.grade], ctx.world.economy(ctx.time).priceIndex));
  }

  /** Hand over remote purchases whose delivery time has come (runs at day end). */
  async deliverDue(ctx: SimulationContext): Promise<void> {
    const garage = await this.garage(ctx);
    const due = garage.filter(({ row }) => row.status === 'in-transit' && row.arrivesAt !== null && row.arrivesAt <= ctx.time);
    if (due.length === 0) return;
    let hasPrimary = garage.some(({ row }) => row.isPrimary);
    for (const car of due) {
      car.row.status = 'owned';
      car.row.arrivesAt = null;
      car.row.conditionAt = ctx.time;
      if (!hasPrimary) {
        car.row.isPrimary = true;
        hasPrimary = true;
      }
      await ctx.manager.save(car.row);
      ctx.notify({ kind: 'system', title: 'Your car has arrived 🚗', body: `The dealer's driver parked your ${car.def.name} (${car.row.plate}) at your gate.`, tone: 'good' });
      ctx.report({ label: `${car.def.name} delivered`, tone: 'good' });
    }
    this.changed(ctx);
  }

  /** Month-end servicing for every delivered car; unpaid services wear the car down (and invite breakdowns). */
  async chargeMaintenance(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    for (const car of await this.garage(ctx)) {
      if (car.row.status !== 'owned') continue;
      const daysOwned = (ctx.time - car.row.acquiredAt) / MINUTES_PER_DAY;
      const cost = monthlyMaintenance(car.def, priceIndex, daysOwned);
      if (cost <= 0) continue;
      const paid = await ctx.wallet.tryPay(cost, 'transport', `Car maintenance: ${car.def.name} (${car.row.plate})`, `vehicle-maintenance:${car.row.id}:${monthIndex}`);
      car.row.skippedServices = paid ? 0 : car.row.skippedServices + 1;
      await this.setCondition(ctx, car, this.condition(ctx, car) + (paid ? SERVICE_BONUS : -SKIPPED_SERVICE_WEAR));
      if (paid) {
        ctx.report({ label: `Car maintenance (${car.def.name})`, amount: -cost, tone: 'neutral' });
      } else {
        ctx.notify({
          kind: 'bill',
          title: 'Mechanic bill unpaid',
          body: `You couldn’t pay ${formatNaira(cost)} to service your ${car.def.name}. It’s starting to make funny noises.`,
          tone: 'bad',
        });
      }
    }
  }

  /** What a paint adds today (metallic, pearl, matte and special finishes; the colour on the lot is free). */
  private paintFee(ctx: SimulationContext, def: VehicleDefinition, paintId: string): number {
    const surcharge = paintSurcharge(def, paintId);
    return surcharge > 0 ? ctx.world.price(surcharge, ctx.time) : 0;
  }

  // ----- Views -----------------------------------------------------------------------------------------------------

  async view(ctx: SimulationContext, licence: DriverLicenceDto): Promise<VehiclesDto> {
    const position = this.position(ctx);
    const deliveryFee = ctx.world.price(VEHICLE_DELIVERY_FEE, ctx.time);
    const catalogue: VehicleCatalogEntryDto[] = VEHICLES.map((vehicle) => ({
      vehicle,
      price: ctx.world.price(vehicle.price, ctx.time),
      deliveryFee,
      paintFees: Object.fromEntries(vehicle.paints.map((paint) => [paint, this.paintFee(ctx, vehicle, paint)]).filter(([, fee]) => (fee as number) > 0)),
      dealerIds: DEALER_IDS.filter((venueId) => dealerStocks(venueId, vehicle)),
      buyHere: dealerHere(position, vehicle) !== null,
    }));
    const mine = (await this.garage(ctx)).map((car) => this.toDto(ctx, car));
    const atDealer = DEALER_IDS.includes(ctx.character.locationId) && !ctx.character.travel ? ctx.character.locationId : null;
    return { catalogue, mine, licence, atDealer };
  }

  toDto(ctx: SimulationContext, car: GarageCar): OwnedVehicleDto {
    const { row, def } = car;
    const condition = this.condition(ctx, car);
    const economy = ctx.world.economy(ctx.time);
    const priceIndex = economy.priceIndex;
    const fuel = this.fuel(car);
    const brokenDown = this.brokenDown(car);
    return {
      id: row.id,
      vehicleId: def.id,
      name: def.name,
      nickname: def.nickname,
      model: def.model,
      paint: row.paint,
      color: vehiclePaint(def, row.paint)?.hex ?? def.color,
      plate: row.plate,
      purchasePrice: row.purchasePrice,
      value: this.value(ctx, car),
      saleOffer: row.status === 'owned' ? this.saleOffer(ctx, car) : 0,
      condition: Math.round(condition),
      drivable: this.canDrive(ctx, car),
      mileageKm: Math.round(row.mileageKm),
      acquiredAt: row.acquiredAt,
      isPrimary: row.isPrimary,
      status: row.status,
      arrivesAt: row.arrivesAt,
      repairCost: workshopRepairCost(def, condition, brokenDown, priceIndex),
      towRepairCost: towRepairCost(def, condition, brokenDown, priceIndex),
      roadsideRepairCost: roadsideRepairCost(def, condition, brokenDown, priceIndex),
      monthlyMaintenance: monthlyMaintenance(def, priceIndex),
      fuelLitres: Math.round(fuel * 10) / 10,
      tankLitres: fuelTankLitres(def),
      rangeKm: Math.round(fuelRangeKm(def, fuel)),
      fuelType: def.fuelType,
      pumpPrice: this.pumpPrice(ctx, car),
      jerrycanPrice: jerrycanPrice(economy.fuelPrice, def.fuelType, priceIndex),
      brokenDown,
      canDrive: this.canDrive(ctx, car),
    };
  }

  // ----- Internals -------------------------------------------------------------------------------------------------

  private async promoteNextPrimary(ctx: SimulationContext, soldId: string): Promise<void> {
    const next = (await this.garage(ctx))
      .filter(({ row }) => row.id !== soldId && row.status === 'owned')
      .toSorted((a, b) => this.value(ctx, b) - this.value(ctx, a))[0];
    if (!next) return;
    next.row.isPrimary = true;
    await ctx.manager.save(next.row);
  }

  private position(ctx: SimulationContext): BuyerPosition {
    return { locationId: ctx.character.locationId, travelling: ctx.character.travel !== null, hour: toDateParts(ctx.time).hour };
  }

  changed(ctx: SimulationContext): void {
    ctx.invalidate(GARAGE_MEMO);
    ctx.invalidate(ITEM_TAGS_MEMO);
  }
}
