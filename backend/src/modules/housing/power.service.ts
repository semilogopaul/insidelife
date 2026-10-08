import { Inject, Injectable } from '@nestjs/common';
import {
  DIESEL_PREMIUM,
  DISTRICTS,
  MINUTES_PER_DAY,
  formatNaira,
  generatorLitresPerDay,
  nepaComfortPenalty,
  type DistrictId,
  type GameMinute,
  type PowerDto,
} from '@insidelife/shared';
import { INVENTORY_PORT, type HomeComfortBonus, type InventoryPort } from '../../common/ports/inventory.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HomeService } from './home.service.js';
import { HousingStore } from './housing.store.js';

/**
 * NEPA: hours of grid power by district (none during a national grid collapse), the comfort lost in the dark, and the
 * generator fuel bill for people who refuse to suffer.
 */
@Injectable()
export class PowerService {
  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    private readonly homes: HomeService,
    private readonly store: HousingStore,
  ) {}

  /** Furniture, bed and power backup the character owns (memoised per game day). */
  async amenities(ctx: SimulationContext): Promise<HomeComfortBonus> {
    const day = Math.floor(ctx.time / MINUTES_PER_DAY);
    return this.store.cached(ctx, `amenities:${day}`, () => this.inventory.homeComfortBonus(ctx));
  }

  gridHours(ctx: SimulationContext, districtId: DistrictId, t: GameMinute): number {
    return this.gridCollapse(ctx, t) ? 0 : DISTRICTS[districtId].gridHours;
  }

  /** Today's power situation at home. */
  async status(ctx: SimulationContext, t: GameMinute = ctx.time): Promise<PowerDto> {
    const home = await this.homes.current(ctx);
    const amenities = await this.amenities(ctx);
    const residence = await this.store.residence(ctx);
    const day = Math.floor(t / MINUTES_PER_DAY);
    const gridCollapse = this.gridCollapse(ctx, t);
    const gridHours = gridCollapse ? 0 : DISTRICTS[home.districtId].gridHours;
    const fuelled = residence.generatorDryDay !== day;
    const litres = amenities.power === 'generator' ? generatorLitresPerDay(gridHours, home.generator.litresPerHour) : 0;
    return {
      gridHours,
      gridCollapse,
      backup: amenities.power,
      fuelled,
      comfortPenalty: nepaComfortPenalty({ gridHours, backup: amenities.power, fuelled, gridCollapse }),
      dailyFuelCost: Math.round(litres * this.pricePerLitre(ctx, t, home.generator.fuel === 'diesel')),
    };
  }

  /**
   * Buy tomorrow's generator fuel at day end (`dayIndex` just ended). If the character can't afford it the generator
   * stays off tomorrow and the blackout penalty applies in full.
   */
  async chargeFuel(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const amenities = await this.amenities(ctx);
    const residence = await this.store.residence(ctx);
    const nextDay = dayIndex + 1;
    if (amenities.power !== 'generator') {
      if (residence.generatorDryDay !== null) {
        residence.generatorDryDay = null;
        await this.store.save(ctx, residence);
      }
      return;
    }

    const home = await this.homes.current(ctx);
    const midday = nextDay * MINUTES_PER_DAY + MINUTES_PER_DAY / 2;
    const litres = generatorLitresPerDay(this.gridHours(ctx, home.districtId, midday), home.generator.litresPerHour);
    const diesel = home.generator.fuel === 'diesel';
    const cost = Math.round(litres * this.pricePerLitre(ctx, ctx.time, diesel));
    if (cost <= 0) return;

    const fuel = diesel ? 'diesel' : 'petrol';
    const paid = await ctx.wallet.tryPay(cost, 'living-cost', `Generator ${fuel} (${litres}L)`, `generator:${nextDay}`);
    if (paid) {
      if (residence.generatorDryDay !== null) {
        residence.generatorDryDay = null;
        await this.store.save(ctx, residence);
      }
      return;
    }
    const alreadyDry = residence.generatorDryDay === dayIndex;
    residence.generatorDryDay = nextDay;
    await this.store.save(ctx, residence);
    if (!alreadyDry) {
      ctx.notify({
        kind: 'bill',
        title: 'Gen don dry',
        body: `You couldn’t buy ${fuel} (${formatNaira(cost)}) for the generator. Na candle and hand fan tonight.`,
        tone: 'bad',
      });
    }
  }

  private gridCollapse(ctx: SimulationContext, t: GameMinute): boolean {
    return ctx.world.isActive(t, 'grid-collapse');
  }

  private pricePerLitre(ctx: SimulationContext, t: GameMinute, diesel: boolean): number {
    return ctx.world.economy(t).fuelPrice * (diesel ? DIESEL_PREMIUM : 1);
  }
}
