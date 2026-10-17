import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { RaceEntryEntity } from './entities/race-entry.entity.js';
import { RaceEntity } from './entities/race.entity.js';
import { RacesController } from './races.controller.js';
import { RacesService } from './races.service.js';
import { RacesSystem } from './races.system.js';

/**
 * Race a friend to the other city: challenge up to three friends in your city, the clock starts at the last acceptance,
 * and the first to arrive in the other city (any way: private plane, airliner, coach) wins. Arrivals are detected in the
 * simulation's trip-arrival hook; no money is staked.
 */
@Module({
  imports: [SimulationModule, NotificationsModule, TypeOrmModule.forFeature([RaceEntity, RaceEntryEntity])],
  controllers: [RacesController],
  providers: [RacesService, RacesSystem],
})
export class RacesModule {}
