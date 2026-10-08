import { Injectable, type OnModuleInit } from '@nestjs/common';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import { ApplicationsService } from './applications.service.js';
import { CareerStore } from './career.store.js';
import { careerEvents } from './careers.events.js';
import { EmploymentService } from './employment.service.js';
import { PromotionsService } from './promotions.service.js';

/** Registers the careers life-event cards with the events engine on startup. */
@Injectable()
export class CareerEventsRegistrar implements OnModuleInit {
  constructor(
    private readonly events: LifeEventsRegistry,
    private readonly store: CareerStore,
    private readonly employment: EmploymentService,
    private readonly promotions: PromotionsService,
    private readonly applications: ApplicationsService,
  ) {}

  onModuleInit(): void {
    this.events.register(
      ...careerEvents({ store: this.store, employment: this.employment, promotions: this.promotions, applications: this.applications }),
    );
  }
}
