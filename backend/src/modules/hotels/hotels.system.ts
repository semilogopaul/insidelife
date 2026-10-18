import { Injectable, type OnModuleInit } from '@nestjs/common';
import { HOTEL_TIER_INFO, findHotel, findVenue, type ProfileContext } from '@insidelife/shared';
import type { Residence, Segment, SummaryContribution, SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { HotelsService, STAY_ROWS } from './hotels.service.js';

/** A booked room outranks a family home or a rented flat for the nights it covers (a hospital ward still wins). */
const HOTEL_RESIDENCE_PRIORITY = 25;

/**
 * Hotels in the simulation: a booked room is a temporary home (where the autopilot beds you down, `residence`), its bed
 * decides how well you sleep while you are in it (`profileContext`), checkout happens at its time (`onSettled`), and the
 * stay shows in the snapshot summary (HUD, Map).
 */
@Injectable()
export class HotelsSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'hotels';
  /** After housing (150): the room's bed replaces the home's while you are in it. */
  readonly order = 160;
  readonly rowProbes = [STAY_ROWS];

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly hotels: HotelsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async residence(ctx: SimulationContext, t: number): Promise<Residence | null> {
    const stay = await this.hotels.stayAt(ctx, t);
    const venue = stay ? findVenue(stay.venueId) : undefined;
    if (!stay || !venue) return null;
    return { locationId: venue.id, districtId: venue.districtId, cityId: this.hotels.cityOf(stay), label: `Hotel room · ${venue.name}`, priority: HOTEL_RESIDENCE_PRIORITY };
  }

  /** In your room the hotel's bed and comfort apply, not your home's. */
  async profileContext(ctx: SimulationContext, base: ProfileContext): Promise<ProfileContext> {
    const stay = await this.hotels.stayAt(ctx, ctx.time);
    if (!stay || ctx.character.locationId !== stay.venueId) return base;
    const tier = HOTEL_TIER_INFO[findHotel(stay.venueId)?.tier ?? 'standard'];
    return { ...base, comfort: Math.max(base.comfort, 40 + tier.comfort), bedQuality: Math.max(base.bedQuality, tier.bedQuality) };
  }

  /** Bedtime with no home in this city and no room: point the traveller at the hotels. */
  async onSegment(ctx: SimulationContext, segment: Segment): Promise<void> {
    await this.hotels.noteNoBed(ctx, segment.startsAt, segment.endsAt);
  }

  async onSettled(ctx: SimulationContext): Promise<void> {
    await this.hotels.endDue(ctx);
  }

  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    return { stay: await this.hotels.summary(ctx) };
  }
}
