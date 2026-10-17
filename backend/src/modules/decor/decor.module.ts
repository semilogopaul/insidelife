import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HousingModule } from '../housing/housing.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { VisitsModule } from '../visits/visits.module.js';
import { DecorController } from './decor.controller.js';
import { DecorService } from './decor.service.js';
import { DecorPieceEntity } from './entities/decor-piece.entity.js';

/**
 * Interior decor: the Decor store (rugs, beds, plants, aquariums, art, lamps, cushions, shelves, mirrors, tables) and
 * Decorate mode for the rooms of a home you rent or own. Consumes HOUSEHOLD_PORT (who may decorate) and
 * HOME_ACCESS_PORT (who may see a host's rooms).
 */
@Module({
  imports: [SimulationModule, HousingModule, VisitsModule, TypeOrmModule.forFeature([DecorPieceEntity])],
  controllers: [DecorController],
  providers: [DecorService],
})
export class DecorModule {}
