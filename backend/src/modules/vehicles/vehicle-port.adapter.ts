import { Injectable } from '@nestjs/common';
import { VEHICLE_PAINTS } from '@insidelife/shared';
import type { DrivenVehicle, VehiclePort } from '../../common/ports/vehicle.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { WEAR_PER_KM } from './rules/vehicle.rules.js';
import { VehiclesService } from './vehicles.service.js';

/** VEHICLE_PORT for the movement layer: which car you drive, and wear from open-world driving. */
@Injectable()
export class VehiclePortAdapter implements VehiclePort {
  constructor(private readonly vehicles: VehiclesService) {}

  async driving(ctx: SimulationContext): Promise<DrivenVehicle | null> {
    const car = await this.vehicles.driving(ctx);
    if (!car) return null;
    return {
      ownedVehicleId: car.row.id,
      vehicleId: car.def.id,
      name: car.def.name,
      model: car.def.model,
      color: VEHICLE_PAINTS[car.row.paint]?.hex ?? car.def.color,
      plate: car.row.plate,
      fuelType: car.def.fuelType,
      fuelEconomyKmPerLitre: car.def.fuelEconomyKmPerLitre,
    };
  }

  async recordDistance(ctx: SimulationContext, km: number): Promise<void> {
    if (km <= 0) return;
    const car = await this.vehicles.driving(ctx);
    if (!car) return;
    car.row.mileageKm += km;
    car.row.lastDrivenAt = ctx.time;
    await this.vehicles.setCondition(ctx, car, this.vehicles.condition(ctx, car) - km * WEAR_PER_KM);
  }
}
