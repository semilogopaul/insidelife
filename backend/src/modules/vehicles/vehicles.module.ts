import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EducationModule } from '../education/education.module.js';
import { EventsModule } from '../events/events.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { OwnedVehicleEntity } from './entities/owned-vehicle.entity.js';
import { LicenceService } from './licence.service.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';
import { VehiclesSystem } from './vehicles.system.js';
import { VEHICLE_PORT } from '../../common/ports/vehicle.port.js';
import { VehiclePortAdapter } from './vehicle-port.adapter.js';

/**
 * Vehicles domain: buying, owning and running cars (depreciation, maintenance, repairs, road events) and the FRSC
 * licence (a certification held by the education domain via `CREDENTIALS_PORT`). Owning a working car gives the
 * `car` item tag that unlocks driving and car commutes.
 */
@Module({
  imports: [SimulationModule, EventsModule, EducationModule, TypeOrmModule.forFeature([OwnedVehicleEntity])],
  controllers: [VehiclesController],
  providers: [VehiclesService, LicenceService, VehiclesSystem, VehiclePortAdapter, { provide: VEHICLE_PORT, useExisting: VehiclePortAdapter }],
  exports: [VEHICLE_PORT],
})
export class VehiclesModule {}
