import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CITY_TRAVEL_PORT, LagosOnlyCityTravel } from '../../common/ports/city-travel.port.js';
import { EducationModule } from '../education/education.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { AviationController } from './aviation.controller.js';
import { AviationService } from './aviation.service.js';
import { AviationSystem } from './aviation.system.js';
import { AircraftEntity } from './entities/aircraft.entity.js';
import { PilotTrainingEntity } from './entities/pilot-training.entity.js';
import { PilotTrainingService } from './pilot-training.service.js';

/**
 * Private aviation: buying and running aircraft (hangar, crew, maintenance, fuel; liveries, names and 5N- registrations)
 * and the Private Pilot Licence (a certification held by the education domain via `CREDENTIALS_PORT`).
 *
 * TODO(multi-city merge): `CITY_TRAVEL_PORT` is bound to the Lagos-only stub. When the multi-city module lands, import
 * it here and bind `{ provide: CITY_TRAVEL_PORT, useExisting: <its adapter> }` instead, then delete `LagosOnlyCityTravel`.
 */
@Module({
  imports: [SimulationModule, EducationModule, TypeOrmModule.forFeature([AircraftEntity, PilotTrainingEntity])],
  controllers: [AviationController],
  providers: [AviationService, PilotTrainingService, AviationSystem, LagosOnlyCityTravel, { provide: CITY_TRAVEL_PORT, useExisting: LagosOnlyCityTravel }],
})
export class AviationModule {}
