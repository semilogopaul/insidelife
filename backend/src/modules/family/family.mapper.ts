import {
  MET_AT_LABELS,
  findVenue,
  type ChildDto,
  type InteractionType,
  type PersonDto,
  type RelationshipDto,
} from '@insidelife/shared';
import type { PersonEntity } from './entities/person.entity.js';
import type { RelationshipEntity } from './entities/relationship.entity.js';
import { ageOf, identityOf, type FamilyGraph } from './interfaces/family-graph.js';
import { effectiveCloseness, effectiveRomance } from './rules/closeness.rules.js';

function metAt(id: string | null): PersonDto['metAt'] {
  if (!id) return null;
  const label = MET_AT_LABELS[id] ?? findVenue(id)?.name ?? 'Around Lagos';
  return { id, label };
}

export function toPersonDto(graph: FamilyGraph, rel: RelationshipEntity, t: number): PersonDto {
  const identity = identityOf(graph, rel);
  const person = identity.person;
  return {
    id: rel.id,
    personId: rel.personId,
    characterId: rel.otherCharacterId ?? person?.characterId ?? null,
    handle: identity.player?.handle ?? null,
    isPlayer: identity.isPlayer,
    firstName: identity.firstName,
    lastName: identity.lastName,
    gender: identity.gender,
    age: ageOf(identity, t),
    alive: identity.alive,
    deceasedAt: identity.deceasedAt,
    ethnicity: identity.ethnicity,
    traits: person?.traits ?? [],
    occupation: person?.occupation ?? null,
    wealth: person?.wealth ?? null,
    kind: rel.kind,
    closeness: Math.round(effectiveCloseness(rel, t)),
    romance: Math.round(effectiveRomance(rel, t, (rel.flags.abroadUntil ?? 0) > t)),
    since: rel.since,
    lastContactAt: rel.lastContactAt,
    metAt: metAt(rel.metAt),
  };
}

export function toRelationshipDto(graph: FamilyGraph, rel: RelationshipEntity, t: number): RelationshipDto {
  const cooldowns: Partial<Record<InteractionType, number>> = {};
  for (const [type, until] of Object.entries(rel.flags.cooldowns ?? {}) as Array<[InteractionType, number]>) {
    if (until > t) cooldowns[type] = until;
  }
  return {
    ...toPersonDto(graph, rel, t),
    datingSince: rel.flags.datingSince ?? null,
    engagedAt: rel.flags.engagedAt ?? null,
    introductionDone: rel.flags.introductionDone ?? false,
    traditionalWeddingDone: rel.flags.traditionalDone ?? false,
    whiteWeddingDone: rel.flags.whiteWeddingDone ?? false,
    expectingAt: rel.flags.pregnancyDueAt ?? null,
    cooldowns,
  };
}

export function toChildDto(graph: FamilyGraph, rel: RelationshipEntity, person: PersonEntity, t: number, characterId: string, feePerTerm: number, term: number): ChildDto {
  return {
    ...toPersonDto(graph, rel, t),
    schoolTier: person.schoolTier,
    feePerTerm,
    sentHome: person.sentHomeTerm !== null && person.sentHomeTerm >= term,
    milestones: person.milestones,
    waecCredits: person.waecCredits,
    guardian: person.guardianCharacterId === characterId,
  };
}
