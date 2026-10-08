import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimulationModule } from '../simulation/simulation.module.js';
import { LifeEventEntity } from './entities/life-event.entity.js';
import { LifeEventsController } from './life-events.controller.js';
import { LifeEventsRegistry } from './life-events.registry.js';
import { LifeEventsService } from './life-events.service.js';

/**
 * Life-event engine. Domain modules import this module and call `LifeEventsRegistry.register(...)` with their cards.
 */
@Module({
  imports: [SimulationModule, TypeOrmModule.forFeature([LifeEventEntity])],
  controllers: [LifeEventsController],
  providers: [LifeEventsRegistry, LifeEventsService],
  exports: [LifeEventsRegistry, LifeEventsService],
})
export class EventsModule {}
