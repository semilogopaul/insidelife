import { Module } from '@nestjs/common';
import { PLAYER_POSITION_PORT } from '../../common/ports/player-position.port.js';
import { CharactersModule } from '../characters/characters.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { VisitsModule } from '../visits/visits.module.js';
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
  imports: [CharactersModule, SimulationModule, NotificationsModule, PresenceModule, VehiclesModule, VisitsModule],
  controllers: [CharactersController, ActivitiesController, NotificationsController],
  providers: [
    CharacterCreationService,
    SnapshotService,
    ActionsService,
    SettingsService,
    MovementService,
    MovementTracker,
    { provide: PLAYER_POSITION_PORT, useExisting: MovementTracker },
  ],
  // PLAYER_POSITION_PORT: promotions checks ad views against the player's last accepted position.
  exports: [SnapshotService, PLAYER_POSITION_PORT],
})
export class LifeModule {}
