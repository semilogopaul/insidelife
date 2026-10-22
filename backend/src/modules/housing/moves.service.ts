import { Injectable } from '@nestjs/common';
import { cityOfDistrict, type DistrictId } from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { LeaseEntity } from './entities/lease.entity.js';
import { HomeService } from './home.service.js';
import { HousingStore } from './housing.store.js';
import { LettingsService } from './lettings.service.js';
import { RentalsService } from './rentals.service.js';

/** Moving house: leave the current home cleanly (end the lease, free your flat) and settle into the next one. */
@Injectable()
export class MovesService {
  constructor(
    private readonly store: HousingStore,
    private readonly homes: HomeService,
    private readonly rentals: RentalsService,
    private readonly lettings: LettingsService,
  ) {}

  /** `family` or the id of a finished building's property. */
  async moveTo(ctx: SimulationContext, to: string): Promise<void> {
    const residence = await this.store.residence(ctx);
    if (to === 'family') {
      if (residence.kind === 'family') throw new GameRuleException('ALREADY_HOME', 'You’re already living with your family.');
      await this.vacateCurrent(ctx);
      await this.homes.relocate(ctx, { kind: 'family' });
      return;
    }

    const property = await this.store.property(ctx, to);
    const building = this.store.buildingOf(await this.store.portfolio(ctx), property.id);
    if (!building || building.status !== 'complete') {
      throw new GameRuleException(
        'NOT_BUILT',
        building?.status === 'under-construction' ? 'The house isn’t finished yet — patience, the roof is coming.' : 'There’s no house on that land yet. Build first.',
      );
    }
    if (property.status === 'selling') throw new GameRuleException('PROPERTY_LISTED', 'It’s listed for sale — cancel the sale before moving in.');
    if (residence.kind === 'owned' && residence.buildingId === building.id) throw new GameRuleException('ALREADY_HOME', 'You already live there.');
    this.lettings.assertOwnerCanMoveIn(building);

    await this.vacateCurrent(ctx);
    await this.lettings.occupyByOwner(ctx, building);
    await this.homes.relocate(ctx, { kind: 'owned', property, building });
  }

  /**
   * Home follows the city you're in. Where you own a finished house you can live in (not up for sale, a unit free of
   * tenants), the best of them is home; back in your family's city with no house of your own there, the family house is.
   * Free and instant, and each house keeps its furniture (pieces belong to the house they stand in). A rented home is
   * never left this way: moving out would end the lease. Returns the new home's district when home moved.
   */
  async followCity(ctx: SimulationContext): Promise<DistrictId | null> {
    const character = ctx.character;
    if (!character.alive || character.travel || cityOfDistrict(character.homeDistrictId) === character.cityId) return null;
    const residence = await this.store.residence(ctx);
    if (residence.kind === 'rented') return null;
    const portfolio = await this.store.portfolio(ctx);
    const houses = portfolio.properties
      .filter((property) => property.status === 'owned' && cityOfDistrict(property.districtId) === character.cityId)
      .flatMap((property) => {
        const building = this.store.buildingOf(portfolio, property.id);
        return building && building.status === 'complete' && this.lettings.ownerCanMoveIn(building) ? [{ property, building }] : [];
      })
      .toSorted((a, b) => b.building.value - a.building.value);
    const house = houses[0];
    if (house) {
      await this.moveTo(ctx, house.property.id);
      return house.property.districtId;
    }
    if (residence.kind === 'owned' && cityOfDistrict(residence.familyDistrictId) === character.cityId) {
      await this.moveTo(ctx, 'family');
      return residence.familyDistrictId;
    }
    return null;
  }

  /** Move into a freshly signed lease. */
  async moveIntoLease(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    await this.vacateCurrent(ctx);
    await this.homes.relocate(ctx, { kind: 'rented', lease });
    await this.store.setLease(ctx, lease);
  }

  private async vacateCurrent(ctx: SimulationContext): Promise<void> {
    const residence = await this.store.residence(ctx);
    if (residence.kind === 'rented' && residence.leaseId) {
      const lease = await this.rentals.leaseById(ctx, residence.leaseId);
      if (lease && (lease.status === 'active' || lease.status === 'grace' || lease.status === 'notice')) {
        await this.rentals.endLease(ctx, lease, 'moved', lease.status === 'active');
      }
      await this.store.setLease(ctx, null);
    }
    if (residence.kind === 'owned' && residence.buildingId) await this.lettings.releaseOwner(ctx, residence.buildingId);
  }
}
