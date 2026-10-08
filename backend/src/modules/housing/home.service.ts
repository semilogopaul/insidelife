import { Injectable } from '@nestjs/common';
import {
  BLUEPRINTS,
  DISTRICTS,
  FAMILY_HOMES,
  HOUSING_TYPES,
  MINUTES_PER_DAY,
  familyLivingCostMultiplier,
  type BlueprintId,
  type DistrictId,
  type GeneratorFuel,
  type HomeOwnership,
  type HousingTypeId,
} from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { BuildingEntity } from './entities/building.entity.js';
import type { LeaseEntity } from './entities/lease.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';
import { HousingStore } from './housing.store.js';

/** The character's home, resolved from the residence row and whatever it points at. */
export interface HomeState {
  readonly ownership: HomeOwnership;
  readonly label: string;
  readonly districtId: DistrictId;
  readonly typeId: HousingTypeId | null;
  readonly blueprintId: BlueprintId | null;
  readonly bedrooms: number;
  /** Comfort the home itself adds (0-15). */
  readonly typeComfort: number;
  /** Multiplier on district prestige for status. */
  readonly prestigeMultiplier: number;
  readonly generator: { readonly litresPerHour: number; readonly fuel: GeneratorFuel };
  readonly annualRent: number;
  readonly movedInAt: number;
  readonly leaseId: string | null;
  readonly propertyId: string | null;
  readonly buildingId: string | null;
}

export type Relocation =
  | { readonly kind: 'family' }
  | { readonly kind: 'rented'; readonly lease: LeaseEntity }
  | { readonly kind: 'owned'; readonly property: PropertyEntity; readonly building: BuildingEntity };

/** Where the character lives and moving between homes (which also moves their front door on the map). */
@Injectable()
export class HomeService {
  constructor(private readonly store: HousingStore) {}

  async current(ctx: SimulationContext): Promise<HomeState> {
    const residence = await this.store.residence(ctx);
    if (residence.kind === 'rented' && residence.leaseId) {
      const lease = await this.store.lease(ctx);
      if (lease && lease.id === residence.leaseId) return this.rented(lease, residence.movedInAt);
    }
    if (residence.kind === 'owned' && residence.buildingId) {
      const portfolio = await this.store.portfolio(ctx);
      const building = portfolio.buildings.find((candidate) => candidate.id === residence.buildingId && candidate.status === 'complete');
      const property = building ? portfolio.properties.find((candidate) => candidate.id === building.propertyId) : undefined;
      if (building && property && (property.status === 'owned' || property.status === 'selling')) {
        return this.owned(property, building, residence.movedInAt);
      }
    }
    return this.family(ctx, residence.familyDistrictId, residence.familyComfort, residence.kind === 'family' ? residence.movedInAt : ctx.time);
  }

  /** The family house (always available to fall back to). */
  async familyHome(ctx: SimulationContext): Promise<HomeState> {
    const residence = await this.store.residence(ctx);
    return this.family(ctx, residence.familyDistrictId, residence.familyComfort, residence.movedInAt);
  }

  async livingCostMultiplier(ctx: SimulationContext): Promise<number> {
    const residence = await this.store.residence(ctx);
    return residence.kind === 'family' ? familyLivingCostMultiplier(ctx.age) : 1;
  }

  /**
   * Move the character's household. Their `homeDistrictId` (and so their front door on the map) follows; if they are
   * at home right now they simply wake up at the new address.
   */
  async relocate(ctx: SimulationContext, to: Relocation): Promise<void> {
    const residence = await this.store.residence(ctx);
    residence.kind = to.kind;
    residence.leaseId = to.kind === 'rented' ? to.lease.id : null;
    residence.buildingId = to.kind === 'owned' ? to.building.id : null;
    residence.movedInAt = ctx.time;
    residence.generatorDryDay = null;
    residence.lastFloodDay = null;
    residence.securityUntil = null;
    await this.store.save(ctx, residence);

    ctx.character.homeDistrictId =
      to.kind === 'family' ? residence.familyDistrictId : to.kind === 'rented' ? to.lease.districtId : to.property.districtId;
    ctx.invalidate('residence');
    ctx.invalidate('profile-context');
  }

  /** Heavy rain flooded the home's street today. */
  async markStreetFlood(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const residence = await this.store.residence(ctx);
    residence.lastFloodDay = dayIndex;
    await this.store.save(ctx, residence);
    ctx.character.moodModifiers = [
      ...ctx.character.moodModifiers.filter((modifier) => modifier.id !== 'street-flood'),
      { id: 'street-flood', label: 'Your street flooded', value: -4, until: ctx.time + MINUTES_PER_DAY },
    ];
  }

  private family(ctx: SimulationContext, districtId: DistrictId, comfort: number, movedInAt: number): HomeState {
    const family = FAMILY_HOMES[ctx.character.background];
    const type = HOUSING_TYPES[family.typeId];
    return {
      ownership: 'family',
      label: `${family.label}, ${DISTRICTS[districtId].name}`,
      districtId,
      typeId: family.typeId,
      blueprintId: null,
      bedrooms: type.bedrooms,
      typeComfort: comfort,
      prestigeMultiplier: type.prestige,
      generator: type.generator,
      annualRent: 0,
      movedInAt,
      leaseId: null,
      propertyId: null,
      buildingId: null,
    };
  }

  private rented(lease: LeaseEntity, movedInAt: number): HomeState {
    const type = HOUSING_TYPES[lease.typeId];
    return {
      ownership: 'rented',
      label: `${lease.label}, ${DISTRICTS[lease.districtId].name}`,
      districtId: lease.districtId,
      typeId: lease.typeId,
      blueprintId: null,
      bedrooms: type.bedrooms,
      typeComfort: type.comfort,
      prestigeMultiplier: type.prestige,
      generator: type.generator,
      annualRent: lease.annualRent,
      movedInAt,
      leaseId: lease.id,
      propertyId: null,
      buildingId: null,
    };
  }

  private owned(property: PropertyEntity, building: BuildingEntity, movedInAt: number): HomeState {
    const blueprint = BLUEPRINTS[building.blueprintId];
    // Cheap materials and flood damage make even your own house less comfortable.
    const comfort = Math.round(blueprint.comfort * (0.7 + 0.3 * (building.condition / 100)));
    return {
      ownership: 'owned',
      label: `${blueprint.label}, ${property.label}`,
      districtId: property.districtId,
      typeId: null,
      blueprintId: blueprint.id,
      bedrooms: blueprint.bedrooms,
      typeComfort: comfort,
      prestigeMultiplier: blueprint.prestige,
      generator: blueprint.generator,
      annualRent: 0,
      movedInAt,
      leaseId: null,
      propertyId: property.id,
      buildingId: building.id,
    };
  }
}
