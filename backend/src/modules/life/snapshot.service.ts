import { Injectable } from '@nestjs/common';
import {
  MINUTES_PER_DAY,
  findVenue,
  homeLocationId,
  isStreetLocation,
  yearsBetween,
  type CharacterDto,
  type CharacterSnapshotDto,
  type CharacterSummaryDto,
  type OpenWorldPoseDto,
  type PublicCharacterDto,
} from '@insidelife/shared';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { MovementTracker } from './movement-tracker.service.js';

/** How far ahead the client gets a timeline (one game day ≈ 24 real minutes at ×60). */
const TIMELINE_HORIZON = MINUTES_PER_DAY;

@Injectable()
export class SnapshotService {
  constructor(
    private readonly planner: TimelinePlanner,
    private readonly engine: SimulationEngine,
    private readonly registry: SimulationRegistry,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly tracker: MovementTracker,
  ) {}

  /** Build the full snapshot for the owner. Must run inside a `CharacterSession` (settled, locked). */
  async build(ctx: SimulationContext): Promise<CharacterSnapshotDto> {
    const character = ctx.character;
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const timeline = await this.planner.plan(ctx, ctx.time, TIMELINE_HORIZON);
    const balances = await this.ledger.balances(ctx.manager, character.id);
    const summary = await this.summary(ctx);
    const pendingEvents = await this.pendingEvents(ctx);
    const unreadNotifications = await this.notifications.unreadCount(ctx.manager, character.id);
    const openWorld = await this.openWorldPose(character);

    return {
      asOf: ctx.time,
      character: this.characterDto(ctx),
      timeline,
      travel: character.travel ? { ...character.travel } : null,
      wallet: { balance: balances.cash, savings: balances.savings, pension: balances.pension, usd: balances.usd },
      summary,
      pendingEvents,
      unreadNotifications,
      openWorld,
    };
  }

  /** The last accepted open-world position while out on the street (none indoors or once it has gone stale). */
  private async openWorldPose(character: CharacterEntity): Promise<OpenWorldPoseDto | null> {
    if (!isStreetLocation(character.locationId)) return null;
    const fix = await this.tracker.last(character.id);
    return fix ? { position: { x: fix.x, z: fix.z }, heading: fix.heading ?? 0, mode: fix.mode } : null;
  }

  characterDto(ctx: SimulationContext): CharacterDto {
    const c = ctx.character;
    return {
      id: c.id,
      handle: c.handle,
      firstName: c.firstName,
      lastName: c.lastName,
      gender: c.gender,
      stateOfOrigin: c.stateOfOrigin,
      background: c.background,
      appearance: c.appearance,
      outfit: c.outfit,
      bornAt: c.bornAt,
      age: yearsBetween(c.bornAt, ctx.time),
      alive: c.alive,
      generation: c.generation,
      lifestyle: c.lifestyle,
      defaultTransport: c.defaultTransport,
      needs: c.needs,
      mood: this.engine.mood(ctx),
      health: Math.round(c.health),
      fitness: Math.round(c.fitness),
      skills: c.skills,
      status: c.status,
      connections: Math.round(c.connections),
      locationId: c.locationId,
      homeDistrictId: c.homeDistrictId,
      homePropertyId: c.homePropertyId,
      cityId: c.cityId,
      habits: c.habits ?? [],
    };
  }

  /** What other players can see. */
  publicDto(character: CharacterEntity, now: number, online: boolean, title: string | null): PublicCharacterDto {
    return {
      id: character.id,
      handle: character.handle,
      firstName: character.firstName,
      lastName: character.lastName,
      gender: character.gender,
      age: yearsBetween(character.bornAt, now),
      appearance: character.appearance,
      outfit: character.outfit,
      status: character.status,
      title,
      locationId: character.locationId,
      online,
    };
  }

  async summary(ctx: SimulationContext): Promise<CharacterSummaryDto> {
    const character = ctx.character;
    let summary: CharacterSummaryDto = {
      job: null,
      education: null,
      home: { label: 'Family house', districtId: character.homeDistrictId, comfort: 0, ownership: 'family' },
      relationship: { status: 'single', partnerName: null },
      children: 0,
      homeItems: [],
      pantryMeals: character.pantryMeals,
      properties: [],
      conditions: [],
      netWorth: character.netWorth,
    };
    for (const system of this.registry.all) {
      const part = await system.summarize?.(ctx);
      if (part) summary = { ...summary, ...part, conditions: [...summary.conditions, ...(part.conditions ?? [])] };
    }
    return summary;
  }

  private async pendingEvents(ctx: SimulationContext): Promise<number> {
    let total = 0;
    for (const system of this.registry.all) total += (await system.pendingEventCount?.(ctx)) ?? 0;
    return total;
  }

  /** Human label for any location id. */
  static locationLabel(locationId: string, characterId: string): string {
    if (locationId === homeLocationId(characterId)) return 'Home';
    return findVenue(locationId)?.name ?? 'Out and about';
  }
}
