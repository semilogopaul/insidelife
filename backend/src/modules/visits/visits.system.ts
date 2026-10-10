import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { ActionDefinition } from '@insidelife/shared';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { SimulationSystem, SummaryContribution } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { HostingService } from './hosting.service.js';
import { VisitsService } from './visits.service.js';

/**
 * Guests on a visit:
 * - stay at the host's place while the visit is on (autopilot keeps hanging around instead of heading home), unless
 *   they're worn out or hungry — then it takes them home to sleep or eat, and they can come back;
 * - head home on their next update once the visit ended (host called it, or it ran out);
 * - feel the treats a host served them, in their own session (one indexed lookup of pending rows per settle).
 */
/** Below this energy or fullness a guest's autopilot takes them home. */
const STAY_MIN_NEED = 25;

@Injectable()
export class VisitsSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'visits';
  readonly order = 810;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly engine: SimulationEngine,
    private readonly visits: VisitsService,
    private readonly hosting: HostingService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onActionComplete(
    ctx: SimulationContext,
    action: ActionDefinition,
    activity: ActivityState,
  ): Promise<void> {
    if (action.id !== 'hang-around' && action.id !== 'visit-hangout') return;
    if (ctx.character.activity) return;
    const { energy, hunger } = ctx.character.needs;
    if (energy < STAY_MIN_NEED || hunger < STAY_MIN_NEED) return;
    if (await this.visits.stayingOn(ctx, activity.locationId)) this.engine.hangAround(ctx, activity.endsAt);
  }

  async onSettled(ctx: SimulationContext): Promise<void> {
    await this.hosting.applyPending(ctx);
    await this.visits.evictIfUninvited(ctx);
  }

  /**
   * Snapshots apply treats too: the engine skips `onSettled` when no game time has passed since the last settle, so a
   * guest whose client refetches (on `character:invalidate`) in the same game minute as the host's order would
   * otherwise not feel it until a later request. Each row still applies exactly once (`applied_at`).
   */
  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    await this.hosting.applyPending(ctx);
    return {};
  }
}
