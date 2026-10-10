import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { MINUTES_PER_DAY, TRAITS, type InteractionType, type RelationshipKind } from '@insidelife/shared';
import { CharacterEntity } from '../../characters/entities/character.entity.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { PersonEntity } from '../entities/person.entity.js';
import { RelationshipEntity, type RelationshipFlags } from '../entities/relationship.entity.js';
import { identityOf, type FamilyGraph, type PlayerRef } from '../interfaces/family-graph.js';
import { clampStat, effectiveCloseness, effectiveRomance } from '../rules/closeness.rules.js';

export const GRAPH_KEY = 'family:graph';
export const HOUSEHOLD_KEY = 'family:household';

export interface NewRelationship {
  readonly personId?: string;
  readonly otherCharacterId?: string;
  readonly kind: RelationshipKind;
  readonly closeness: number;
  readonly romance?: number;
  readonly metAt: string | null;
  readonly since?: number;
  readonly flags?: RelationshipFlags;
}

/** Required identity of a new NPC; everything else has sensible defaults. */
export type NewPerson = Pick<
  PersonEntity,
  'ownerCharacterId' | 'firstName' | 'lastName' | 'gender' | 'bornAt' | 'ethnicity' | 'traits' | 'parentPersonIds' | 'parentCharacterIds'
> &
  Partial<
    Pick<PersonEntity, 'available' | 'monthlyIncome' | 'wealth' | 'schoolTier' | 'schoolPerformance' | 'guardianCharacterId' | 'occupation' | 'alive' | 'deceasedAt'>
  >;

export interface StatDelta {
  readonly closeness?: number;
  readonly romance?: number;
}

/**
 * Relationships and the people behind them. Loads a character's whole social graph once per session (memoised) and
 * keeps it in sync as rows are created, so hooks that run every game day never re-query.
 */
@Injectable()
export class RelationshipsService {
  graph(ctx: SimulationContext): Promise<FamilyGraph> {
    return ctx.memo(GRAPH_KEY, () => this.load(ctx));
  }

  /** Drop derived caches after the household changes (birth, wedding, divorce, death). */
  householdChanged(ctx: SimulationContext): void {
    ctx.invalidate(HOUSEHOLD_KEY);
  }

  find(graph: FamilyGraph, idOrPersonId: string): RelationshipEntity | undefined {
    return graph.relationships.find((rel) => rel.id === idOrPersonId || rel.personId === idOrPersonId || rel.otherCharacterId === idOrPersonId);
  }

  closeness(rel: RelationshipEntity, t: number): number {
    return effectiveCloseness(rel, t);
  }

  romance(rel: RelationshipEntity, t: number): number {
    return effectiveRomance(rel, t, (rel.flags.abroadUntil ?? 0) > t);
  }

  /**
   * Apply changes on top of today's (decayed) values. Any change counts as contact: the stored value is
   * materialised at `t`, so decay restarts from here. Personality traits scale gains (never losses). Does not save.
   */
  touch(graph: FamilyGraph, rel: RelationshipEntity, t: number, delta: StatDelta): void {
    const traits = identityOf(graph, rel).person?.traits ?? [];
    const scale = (value: number, key: 'closenessGain' | 'romanceGain'): number =>
      value > 0 ? traits.reduce((acc, trait) => acc * TRAITS[trait][key], value) : value;
    rel.closeness = clampStat(this.closeness(rel, t) + scale(delta.closeness ?? 0, 'closenessGain'));
    rel.lastContactAt = t;
    if (delta.romance !== undefined) {
      rel.romance = clampStat(this.romance(rel, t) + scale(delta.romance, 'romanceGain'));
      rel.lastRomanceAt = t;
    }
  }

  setFlags(rel: RelationshipEntity, patch: RelationshipFlags): void {
    rel.flags = { ...rel.flags, ...patch };
  }

  /** Record that an interaction happened (cooldown + attempt counter for deterministic rolls). */
  markInteraction(rel: RelationshipEntity, type: InteractionType, cooldownUntil: number | null): number {
    const attempts = (rel.flags.attempts?.[type] ?? 0) + 1;
    rel.flags = {
      ...rel.flags,
      attempts: { ...rel.flags.attempts, [type]: attempts },
      cooldowns: cooldownUntil === null ? rel.flags.cooldowns : { ...rel.flags.cooldowns, [type]: cooldownUntil },
    };
    return attempts;
  }

  /** Change the kind of relationship (e.g. acquaintance → partner). Romance resets when it ends. */
  changeKind(rel: RelationshipEntity, kind: RelationshipKind, t: number): void {
    rel.kind = kind;
    if (kind === 'partner') rel.flags = { ...rel.flags, datingSince: t, endedBy: undefined };
    if (kind === 'fiance') rel.flags = { ...rel.flags, engagedAt: t };
    if (kind === 'ex') {
      rel.romance = 0;
      rel.lastRomanceAt = t;
      rel.flags = { ...rel.flags, pregnancyDueAt: undefined };
    }
  }

  async save(ctx: SimulationContext, ...rels: RelationshipEntity[]): Promise<void> {
    if (rels.length > 0) await ctx.manager.save(RelationshipEntity, rels);
  }

  async savePeople(ctx: SimulationContext, ...people: PersonEntity[]): Promise<void> {
    if (people.length > 0) await ctx.manager.save(PersonEntity, people);
  }

  async createPerson(ctx: SimulationContext, input: NewPerson): Promise<PersonEntity> {
    const person = ctx.manager.create(PersonEntity, {
      available: true,
      monthlyIncome: 0,
      wealth: 'managing',
      schoolTier: 'none',
      schoolPerformance: 0.5,
      sentHomeTerm: null,
      milestones: [],
      waecCredits: null,
      characterId: null,
      guardianCharacterId: null,
      occupation: null,
      alive: true,
      deceasedAt: null,
      ...input,
    });
    const saved = await ctx.manager.save(PersonEntity, person);
    const graph = await this.graph(ctx);
    graph.people.set(saved.id, saved);
    return saved;
  }

  /** Create a relationship row for this character and add it to the in-session graph. */
  async create(ctx: SimulationContext, input: NewRelationship, characterId = ctx.character.id): Promise<RelationshipEntity> {
    const t = input.since ?? ctx.time;
    const rel = ctx.manager.create(RelationshipEntity, {
      characterId,
      personId: input.personId ?? null,
      otherCharacterId: input.otherCharacterId ?? null,
      kind: input.kind,
      closeness: clampStat(input.closeness),
      romance: clampStat(input.romance ?? 0),
      since: t,
      lastContactAt: ctx.time,
      lastRomanceAt: ctx.time,
      metAt: input.metAt,
      flags: input.flags ?? {},
    });
    const saved = await ctx.manager.save(RelationshipEntity, rel);
    if (characterId === ctx.character.id) {
      const graph = await this.graph(ctx);
      if (!graph.relationships.some((existing) => existing.id === saved.id)) graph.relationships.push(saved);
      if (saved.otherCharacterId && !graph.players.has(saved.otherCharacterId)) {
        const [player] = await this.loadPlayers(ctx, [saved.otherCharacterId]);
        if (player) graph.players.set(player.id, player);
      }
    }
    return saved;
  }

  /** Days since a game minute, rounded down. */
  static daysSince(from: number | undefined, t: number): number {
    return from === undefined ? 0 : Math.max(0, Math.floor((t - from) / MINUTES_PER_DAY));
  }

  async loadPlayers(ctx: SimulationContext, ids: readonly string[]): Promise<PlayerRef[]> {
    if (ids.length === 0) return [];
    const rows = await ctx.manager.find(CharacterEntity, {
      where: { id: In([...ids]) },
      select: {
        id: true,
        userId: true,
        handle: true,
        firstName: true,
        lastName: true,
        gender: true,
        stateOfOrigin: true,
        bornAt: true,
        alive: true,
        diedAt: true,
        locationId: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      handle: row.handle,
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      stateOfOrigin: row.stateOfOrigin,
      bornAt: row.bornAt,
      alive: row.alive,
      diedAt: row.diedAt,
      locationId: row.locationId,
    }));
  }

  private async load(ctx: SimulationContext): Promise<FamilyGraph> {
    const relationships = await ctx.manager.find(RelationshipEntity, {
      where: { characterId: ctx.character.id },
      order: { since: 'ASC' },
    });
    const personIds = relationships.flatMap((rel) => (rel.personId ? [rel.personId] : []));
    const playerIds = relationships.flatMap((rel) => (rel.otherCharacterId ? [rel.otherCharacterId] : []));
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const people = await (personIds.length > 0 ? ctx.manager.find(PersonEntity, { where: { id: In(personIds) } }) : Promise.resolve([]));
    const players = await this.loadPlayers(ctx, playerIds);
    return {
      relationships,
      people: new Map(people.map((person) => [person.id, person])),
      players: new Map(players.map((player) => [player.id, player])),
    };
  }
}
