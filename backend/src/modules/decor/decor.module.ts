import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIRCRAFT_DECOR_PORT } from '../../common/ports/aircraft-decor.port.js';
import { FURNITURE_PORT } from '../../common/ports/furniture.port.js';
import { HousingModule } from '../housing/housing.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { VisitsModule } from '../visits/visits.module.js';
import { DecorController } from './decor.controller.js';
import { DecorService } from './decor.service.js';
import { DecorPieceEntity } from './entities/decor-piece.entity.js';

/**
 * Furniture and decor: the Decor store (rugs, beds, plants, aquariums, art, lamps, cushions, shelves, mirrors, tables),
 * the pieces of furniture bought in the shop (one model: they stand in rooms like decor) and Decorate mode for the rooms
 * of your home. Consumes HOUSEHOLD_PORT (which home), HOME_ACCESS_PORT (who may see a host's rooms) and INVENTORY_PORT
 * (selling furniture back). Implements FURNITURE_PORT: the shop tells it when furniture arrives or leaves and asks which
 * is in the home (looked up lazily by the shop, which housing consumes). Also dresses the cabins of the aircraft you own (placements keyed to
 * the aircraft, owner only); implements AIRCRAFT_DECOR_PORT so a sold aircraft returns its pieces to the inventory.
 */
@Module({
  imports: [SimulationModule, HousingModule, ShopModule, VisitsModule, TypeOrmModule.forFeature([DecorPieceEntity])],
  controllers: [DecorController],
  providers: [DecorService, { provide: AIRCRAFT_DECOR_PORT, useExisting: DecorService }, { provide: FURNITURE_PORT, useExisting: DecorService }],
  exports: [AIRCRAFT_DECOR_PORT, FURNITURE_PORT],
})
export class DecorModule {}
