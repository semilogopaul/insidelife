import type { DistrictId } from '@insidelife/shared';
import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

export interface HomeSnapshot {
  readonly ownership: 'family' | 'rented' | 'owned' | 'hostel';
  readonly label: string;
  readonly districtId: DistrictId;
  /** 0-30 comfort bonus on top of lifestyle. */
  readonly comfort: number;
  readonly annualRent: number;
  readonly bedrooms: number;
}

/** Implemented by the housing module. */
export interface HouseholdPort {
  home(ctx: SimulationContext): Promise<HomeSnapshot>;
  /** Value of all property owned (land, buildings). */
  propertyValue(ctx: SimulationContext): Promise<number>;
  /** Succession: move land, buildings and pending sales to the heir (and the heir into the inherited home). Returns the value moved. */
  transferEstate(ctx: SimulationContext, heirCharacterId: string): Promise<number>;
}

export const HOUSEHOLD_PORT = Symbol('HOUSEHOLD_PORT');
