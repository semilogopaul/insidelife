import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { INVENTORY_PORT, type InventoryPort } from '../../common/ports/inventory.port.js';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import { ConstructionService } from './construction.service.js';
import { HomeService } from './home.service.js';
import { housingEvents } from './housing.events.js';
import { HousingStore } from './housing.store.js';
import { LandService } from './land.service.js';
import { PowerService } from './power.service.js';
import { RentalsService } from './rentals.service.js';

/** Registers the housing life-event cards with the events engine on startup. */
@Injectable()
export class HousingEventsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: LifeEventsRegistry,
    private readonly store: HousingStore,
    private readonly homes: HomeService,
    private readonly power: PowerService,
    private readonly rentals: RentalsService,
    private readonly land: LandService,
    private readonly construction: ConstructionService,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      ...housingEvents({
        store: this.store,
        homes: this.homes,
        power: this.power,
        rentals: this.rentals,
        land: this.land,
        construction: this.construction,
        inventory: this.inventory,
      }),
    );
  }
}
