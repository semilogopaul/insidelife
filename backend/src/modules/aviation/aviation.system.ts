import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { ActionDefinition } from '@insidelife/shared';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { AviationService, FLEET_ROWS } from './aviation.service.js';
import { PilotTrainingService } from './pilot-training.service.js';

/**
 * Aviation in the simulation: month-end hangar, maintenance and crew bills (an unpaid bill grounds the aircraft),
 * ferried aircraft landing, Private Pilot Licence lessons and check-rides, and aircraft in net worth and status.
 * Value is closed-form (age × yearly depreciation), so it is always current without daily writes.
 */
@Injectable()
export class AviationSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'aviation';
  readonly order = 135;
  readonly rowProbes = [FLEET_ROWS];

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly aviation: AviationService,
    private readonly training: PilotTrainingService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    await this.training.onActionComplete(ctx, action, activity);
  }

  /**
   * A ferried (or flown) aircraft lands the moment its time comes: the row is cleared and the owner told on the first
   * settle after `arrivesAt`, not at the next midnight. (Day end alone left a delivery "in the air" for up to a day after
   * its promised landing time.) Cheap: nothing is read for owners without an aircraft.
   */
  async onSettled(ctx: SimulationContext): Promise<void> {
    await this.aviation.landDue(ctx);
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    await this.aviation.chargeMonthly(ctx, monthIndex);
  }

  /** `aircraft` for anyone who owns a plane (the "buy a plane" life goal and badge read it). */
  async itemTags(ctx: SimulationContext): Promise<readonly string[]> {
    return (await this.aviation.fleet(ctx)).length > 0 ? ['aircraft'] : [];
  }

  netWorth(ctx: SimulationContext): Promise<number> {
    return this.aviation.netWorth(ctx);
  }

  status(ctx: SimulationContext): Promise<number> {
    return this.aviation.status(ctx);
  }
}
