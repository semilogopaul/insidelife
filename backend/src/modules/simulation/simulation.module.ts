import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersModule } from '../characters/characters.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { CharacterSession } from './character-session.service.js';
import { CommandReceiptEntity } from './entities/command-receipt.entity.js';
import { SimulationEngine } from './simulation-engine.service.js';
import { SimulationRegistry } from './simulation-registry.service.js';
import { AllowanceSystem } from './systems/allowance.system.js';
import { HabitsSystem } from './systems/habits.system.js';
import { LifestyleSystem } from './systems/lifestyle.system.js';
import { TimelinePlanner } from './timeline-planner.service.js';

/**
 * The simulation core: engine, planner, the per-character session and the registry domain systems plug into.
 * Domain modules import this module and register their `SimulationSystem` in `onModuleInit`.
 */
@Module({
  imports: [CharactersModule, NotificationsModule, PresenceModule, TypeOrmModule.forFeature([CommandReceiptEntity])],
  providers: [SimulationRegistry, TimelinePlanner, SimulationEngine, CharacterSession, LifestyleSystem, AllowanceSystem, HabitsSystem],
  exports: [SimulationRegistry, TimelinePlanner, SimulationEngine, CharacterSession],
})
export class SimulationModule {}
