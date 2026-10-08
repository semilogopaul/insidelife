import { Injectable, type OnModuleInit } from '@nestjs/common';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import { BusinessesStore } from './businesses.store.js';
import { businessEvents } from './businesses.events.js';

/** Registers the businesses life-event cards with the events engine on startup. */
@Injectable()
export class BusinessEventsRegistrar implements OnModuleInit {
  constructor(
    private readonly events: LifeEventsRegistry,
    private readonly store: BusinessesStore,
  ) {}

  onModuleInit(): void {
    this.events.register(...businessEvents({ store: this.store }));
  }
}
