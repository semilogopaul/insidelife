import { Injectable, type OnModuleInit } from '@nestjs/common';
import { socialClout } from '@insidelife/shared';
import type { SimulationSystem, SummaryContribution } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { NightOutService } from './night-out.service.js';
import { PartiesService } from './parties.service.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Social life over time:
 * - keeps the public profile cache fresh — every game day, and on settle when it is older than an hour of game time;
 * - closes the character's ended parties and awards host clout;
 * - contributes a small clout baseline for having a real network;
 * - calls off upcoming parties when the host dies;
 * - applies bottles and birthdays other players bought this character at a club (pending rows, claimed on settle).
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
    private readonly nightOut: NightOutService,
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

  /** Bottles and birthdays others bought you land here (your own session), then the throttled profile refresh. */
  async onSettled(ctx: SimulationContext): Promise<void> {
    await this.nightOut.applyReceived(ctx);
    if (await this.profiles.needsRefresh(ctx)) await this.reconcile(ctx);
  }

  /**
   * Snapshots claim them too: a refetch in the same game minute as the purchase has nothing to settle (the engine skips
   * `onSettled`), but the recipient should still see the lift at once.
   */
  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    await this.nightOut.applyReceived(ctx);
    return {};
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
