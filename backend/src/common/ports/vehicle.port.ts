import type { VehicleModel } from '@insidelife/shared';
import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/** The car the character is driving (primary drivable car). */
export interface DrivenVehicle {
  readonly ownedVehicleId: string;
  readonly vehicleId: string;
  readonly name: string;
  /** Kenney car-kit model key the client renders (sedan, suv, suv-luxury…). */
  readonly model: VehicleModel;
  /** Paint hex. */
  readonly color: string;
  readonly plate: string;
  readonly fuelType: 'petrol' | 'diesel';
  readonly fuelEconomyKmPerLitre: number;
}

/** Implemented by the vehicles module. */
export interface VehiclePort {
  driving(ctx: SimulationContext): Promise<DrivenVehicle | null>;
  /** Add open-world mileage and wear to the driven car. */
  recordDistance(ctx: SimulationContext, km: number): Promise<void>;
}

export const VEHICLE_PORT = Symbol('VEHICLE_PORT');
