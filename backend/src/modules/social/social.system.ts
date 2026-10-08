import { Injectable, type OnModuleInit } from '@nestjs/common';
import { socialClout } from '@insidelife/shared';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { PartiesService } from './parties.service.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Social life over time:
 * - keeps the public profile cache fresh — every game day, and on settle when it is older than an hour of game time;
 * - closes the character's ended parties and awards host clout;
 * - contributes a small clout baseline for having a real network;
 * - calls off upcoming parties when the host dies.
 *
 * Runs late (800) so every domain has updated its state for the day; before life events (900).
 */
@Injectable()
export class SocialSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'social';
  readonly order = 800;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly profiles: ProfilesService,
    private readonly parties: PartiesService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onCharacterCreated(ctx: SimulationContext): Promise<void> {
    await this.profiles.refresh(ctx);
  }

  async onDayEnd(ctx: SimulationContext): Promise<void> {
    await this.reconcile(ctx);
  }

  /** Throttled refresh of the public profile cache after every settle. */
  async onSettled(ctx: SimulationContext): Promise<void> {
    if (await this.profiles.needsRefresh(ctx)) await this.reconcile(ctx);
  }

  /** Clout baseline from the network. */
  async status(ctx: SimulationContext): Promise<number> {
    return socialClout((await this.profiles.cached(ctx))?.friendCount ?? 0);
  }

  async onDeath(ctx: SimulationContext): Promise<void> {
    await this.parties.cancelHosted(ctx);
  }

  private async reconcile(ctx: SimulationContext): Promise<void> {
    await this.parties.finalizeHosted(ctx);
    await this.profiles.refresh(ctx);
  }
}
