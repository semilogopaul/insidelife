import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimulationModule } from '../simulation/simulation.module.js';
import { HotelStayEntity } from './entities/hotel-stay.entity.js';
import { HotelsController } from './hotels.controller.js';
import { HotelsService } from './hotels.service.js';
import { HotelsSystem } from './hotels.system.js';

/** Hotels in Lagos and Abuja: rooms to book, a temporary home until checkout (docs/MULTI_CITY.md). */
@Module({
  imports: [SimulationModule, TypeOrmModule.forFeature([HotelStayEntity])],
  controllers: [HotelsController],
  providers: [HotelsService, HotelsSystem],
})
export class HotelsModule {}
