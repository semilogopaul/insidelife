import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DecorModule } from '../decor/decor.module.js';
import { EducationModule } from '../education/education.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { TravelModule } from '../travel/travel.module.js';
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
 * Flights between the cities go through `CITY_TRAVEL_PORT`, provided by the travel module.
 */
@Module({
  imports: [SimulationModule, EducationModule, DecorModule, TravelModule, TypeOrmModule.forFeature([AircraftEntity, PilotTrainingEntity])],
  controllers: [AviationController],
  providers: [AviationService, PilotTrainingService, AviationSystem],
})
export class AviationModule {}
