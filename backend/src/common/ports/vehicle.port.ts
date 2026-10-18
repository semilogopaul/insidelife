import type { CityId, DrivenVehicleDto } from '@insidelife/shared';
import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/** The car with you on the street: what the 3D client renders plus its running state (fuel, condition, breakdown). */
export type DrivenVehicle = DrivenVehicleDto;

/** Implemented by the vehicles module (the movement layer owns positions; vehicles own tanks and bills). */
export interface VehiclePort {
  /** The car with you out on the street, whatever state it's in (empty or broken down too); null without one. */
  driving(ctx: SimulationContext): Promise<DrivenVehicle | null>;
  /**
   * Open-world driving: burn fuel for `km` map km, add mileage, wear and crash damage (`bumps`, m/s lost in hard
   * hits) and roll for a breakdown. Returns the car afterwards, or null without one.
   */
  drive(ctx: SimulationContext, km: number, bumps?: number): Promise<DrivenVehicle | null>;
  /** The other city your cars are parked in, when you own a delivered car but none is in the city you are in; else null. */
  parkedElsewhere(ctx: SimulationContext): Promise<CityId | null>;
  /** Buy fuel at a pump (`litres` null = fill up). Null without a car. */
  refuel(ctx: SimulationContext, litres: number | null, stationName: string, key: string): Promise<{ litres: number; pricePerLitre: number; cost: number; car: DrivenVehicle } | null>;
  /** A proper repair at a workshop. Null without a car. */
  workshopRepair(ctx: SimulationContext, workshopName: string, key: string): Promise<{ cost: number; car: DrivenVehicle } | null>;
}

export const VEHICLE_PORT = Symbol('VEHICLE_PORT');
