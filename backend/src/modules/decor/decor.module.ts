import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIRCRAFT_DECOR_PORT } from '../../common/ports/aircraft-decor.port.js';
import { HousingModule } from '../housing/housing.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { VisitsModule } from '../visits/visits.module.js';
import { DecorController } from './decor.controller.js';
import { DecorService } from './decor.service.js';
import { DecorPieceEntity } from './entities/decor-piece.entity.js';

/**
 * Interior decor: the Decor store (rugs, beds, plants, aquariums, art, lamps, cushions, shelves, mirrors, tables) and
 * Decorate mode for the rooms of a home you rent or own. Consumes HOUSEHOLD_PORT (who may decorate) and
 * HOME_ACCESS_PORT (who may see a host's rooms). Also dresses the cabins of the aircraft you own (placements keyed to
 * the aircraft, owner only); implements AIRCRAFT_DECOR_PORT so a sold aircraft returns its pieces to the inventory.
 */
@Module({
  imports: [SimulationModule, HousingModule, VisitsModule, TypeOrmModule.forFeature([DecorPieceEntity])],
  controllers: [DecorController],
  providers: [DecorService, { provide: AIRCRAFT_DECOR_PORT, useExisting: DecorService }],
  exports: [AIRCRAFT_DECOR_PORT],
})
export class DecorModule {}
