import { Injectable, Logger } from '@nestjs/common';
import {
  BASELINE_CONDITION,
  MAX_VEHICLES,
  MINUTES_PER_DAY,
  VEHICLES,
  VEHICLE_DELIVERY_FEE,
  VEHICLE_PAINTS,
  VEHICLE_UNDRIVABLE_CONDITION,
  VENUES,
  dealerStocks,
  findVehicle,
  findVenue,
  formatNaira,
  isVehiclePaintId,
  startOfDay,
  toDateParts,
  vehiclePaint,
  type DriverLicenceDto,
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
  vehicleRepairCost,
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

  /** Cars delivered and in good enough shape to start. */
  async drivable(ctx: SimulationContext): Promise<readonly GarageCar[]> {
    return (await this.garage(ctx)).filter((car) => car.row.status === 'owned' && this.condition(ctx, car) >= VEHICLE_UNDRIVABLE_CONDITION);
  }

  /** The car you drive: the primary one if it starts, else any car that starts. */
  async driving(ctx: SimulationContext): Promise<GarageCar | null> {
    const cars = await this.drivable(ctx);
    return cars.find((car) => car.row.isPrimary) ?? cars[0] ?? null;
  }

  async find(ctx: SimulationContext, id: string): Promise<GarageCar> {
    const car = (await this.garage(ctx)).find(({ row }) => row.id === id);
    if (!car) throw new ResourceNotFoundException('Vehicle');
    return car;
  }

  condition(ctx: SimulationContext, car: GarageCar): number {
    return vehicleConditionNow(car.row.condition, car.row.conditionAt, ctx.time);
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
    const deliveryFee = dealerId ? 0 : ctx.world.price(VEHICLE_DELIVERY_FEE, ctx.time);
    if (!ctx.wallet.canAfford(price + deliveryFee)) throw new InsufficientFundsException(price + deliveryFee);

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
      }),
    );

    const dealer = dealerId ? findVenue(dealerId)?.name : undefined;
    const metadata = { vehicleId: def.id, ownedVehicleId: row.id, plate: row.plate };
    await ctx.wallet.pay(price, 'purchase', `${def.name} (${def.nickname}) — ${dealer ?? 'remote purchase'}`, `vehicle-purchase:${row.id}`, { metadata });
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
    return { channel: dealer ? 'in-person' : 'delivery', vehicle: this.toDto(ctx, car), price, deliveryFee, balance: ctx.wallet.cash };
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

  async repair(ctx: SimulationContext, id: string): Promise<VehicleRepairResultDto> {
    const car = await this.find(ctx, id);
    if (car.row.status !== 'owned') throw new GameRuleException('NOT_DELIVERED', `Your ${car.def.name} hasn’t been delivered yet`);
    const cost = vehicleRepairCost(car.def, this.condition(ctx, car), ctx.world.economy(ctx.time).priceIndex);
    if (cost === 0) throw new GameRuleException('NOTHING_TO_REPAIR', `Your ${car.def.name} is in top shape`);
    await ctx.wallet.pay(cost, 'transport', `Mechanic: ${car.def.name} (${car.row.plate})`, `vehicle-repair:${car.row.id}:${ctx.time}`);
    car.row.skippedServices = 0;
    await this.setCondition(ctx, car, 100);
    return { vehicle: this.toDto(ctx, car), cost, balance: ctx.wallet.cash };
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

  // ----- Views -----------------------------------------------------------------------------------------------------

  async view(ctx: SimulationContext, licence: DriverLicenceDto): Promise<VehiclesDto> {
    const position = this.position(ctx);
    const deliveryFee = ctx.world.price(VEHICLE_DELIVERY_FEE, ctx.time);
    const catalogue: VehicleCatalogEntryDto[] = VEHICLES.map((vehicle) => ({
      vehicle,
      price: ctx.world.price(vehicle.price, ctx.time),
      deliveryFee,
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
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
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
      drivable: row.status === 'owned' && condition >= VEHICLE_UNDRIVABLE_CONDITION,
      mileageKm: Math.round(row.mileageKm),
      acquiredAt: row.acquiredAt,
      isPrimary: row.isPrimary,
      status: row.status,
      arrivesAt: row.arrivesAt,
      repairCost: vehicleRepairCost(def, condition, priceIndex),
      monthlyMaintenance: monthlyMaintenance(def, priceIndex),
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
