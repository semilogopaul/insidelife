import { Injectable } from '@nestjs/common';
import type { CityId } from '@insidelife/shared';
import type { DrivenVehicle, VehiclePort } from '../../common/ports/vehicle.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { VehiclesService } from './vehicles.service.js';

/** VEHICLE_PORT for the movement layer: the car with you, the fuel and wear of open-world driving, pumps and workshops. */
@Injectable()
export class VehiclePortAdapter implements VehiclePort {
  constructor(private readonly vehicles: VehiclesService) {}

  async driving(ctx: SimulationContext): Promise<DrivenVehicle | null> {
    const car = await this.vehicles.withYou(ctx);
    return car ? this.vehicles.driven(ctx, car) : null;
  }

  async drive(ctx: SimulationContext, km: number, bumps = 0): Promise<DrivenVehicle | null> {
    const car = await this.vehicles.withYou(ctx);
    if (!car) return null;
    if (km > 0 || bumps > 0) await this.vehicles.drive(ctx, car, km, { bumps });
    return this.vehicles.driven(ctx, car);
  }

  async parkedElsewhere(ctx: SimulationContext): Promise<CityId | null> {
    if (await this.vehicles.withYou(ctx)) return null;
    const away = (await this.vehicles.garage(ctx)).find((car) => car.row.status === 'owned');
    return away ? this.vehicles.parkedIn(away) : null;
  }

  async refuel(ctx: SimulationContext, litres: number | null, stationName: string, key: string): Promise<{ litres: number; pricePerLitre: number; cost: number; car: DrivenVehicle } | null> {
    const car = await this.vehicles.withYou(ctx);
    if (!car) return null;
    const sale = await this.vehicles.refuel(ctx, car, litres, `Fuel at ${stationName}`, key);
    return { ...sale, car: this.vehicles.driven(ctx, car) };
  }

  async workshopRepair(ctx: SimulationContext, workshopName: string, key: string): Promise<{ cost: number; car: DrivenVehicle } | null> {
    const car = await this.vehicles.withYou(ctx);
    if (!car) return null;
    const cost = await this.vehicles.workshopRepair(ctx, car, `Mechanic at ${workshopName}: ${car.def.name} (${car.row.plate})`, key);
    return { cost, car: this.vehicles.driven(ctx, car) };
  }
}
