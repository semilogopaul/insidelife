import { Module } from '@nestjs/common';
import { CharactersModule } from '../characters/characters.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { ActionsService } from './actions.service.js';
import { SettingsService } from './settings.service.js';
import { ActivitiesController } from './activities.controller.js';
import { CharacterCreationService } from './character-creation.service.js';
import { CharactersController } from './characters.controller.js';
import { MovementTracker } from './movement-tracker.service.js';
import { MovementService } from './movement.service.js';
import { NotificationsController } from './notifications.controller.js';
import { SnapshotService } from './snapshot.service.js';

/** Player-facing character lifecycle: creation, snapshot, settings, actions and movement. */
@Module({
  imports: [CharactersModule, SimulationModule, NotificationsModule, PresenceModule, VehiclesModule],
  controllers: [CharactersController, ActivitiesController, NotificationsController],
  providers: [CharacterCreationService, SnapshotService, ActionsService, SettingsService, MovementService, MovementTracker],
  exports: [SnapshotService],
})
export class LifeModule {}
