import {
  ethnicityOfState,
  yearsBetween,
  type Ethnicity,
  type Gender,
  type RelationshipKind,
} from '@insidelife/shared';
import type { PersonEntity } from '../entities/person.entity.js';
import type { RelationshipEntity } from '../entities/relationship.entity.js';

/** The slice of another player's character the family domain reads (never writes). */
export interface PlayerRef {
  readonly id: string;
  readonly userId: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: Gender;
  readonly stateOfOrigin: string;
  readonly bornAt: number;
  readonly alive: boolean;
  readonly diedAt: number | null;
  readonly locationId: string;
}

/** A character's relationships with the people (NPCs) and players they point to, loaded once per session. */
export interface FamilyGraph {
  readonly relationships: RelationshipEntity[];
  readonly people: Map<string, PersonEntity>;
  readonly players: Map<string, PlayerRef>;
}

/** Who is on the other side of a relationship, whether NPC or player. */
export interface Identity {
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: Gender;
  readonly bornAt: number;
  readonly alive: boolean;
  readonly deceasedAt: number | null;
  readonly ethnicity: Ethnicity;
  readonly isPlayer: boolean;
  readonly person: PersonEntity | null;
  readonly player: PlayerRef | null;
}

const UNKNOWN: Identity = {
  firstName: 'Someone',
  lastName: '',
  gender: 'male',
  bornAt: 0,
  alive: false,
  deceasedAt: null,
  ethnicity: 'other',
  isPlayer: false,
  person: null,
  player: null,
};

export function identityOf(graph: FamilyGraph, rel: RelationshipEntity): Identity {
  if (rel.otherCharacterId) {
    const player = graph.players.get(rel.otherCharacterId);
    if (!player) return { ...UNKNOWN, isPlayer: true };
    return {
      firstName: player.firstName,
      lastName: player.lastName,
      gender: player.gender,
      bornAt: player.bornAt,
      alive: player.alive,
      deceasedAt: player.diedAt,
      ethnicity: ethnicityOfState(player.stateOfOrigin),
      isPlayer: true,
      person: null,
      player,
    };
  }
  const person = rel.personId ? graph.people.get(rel.personId) : undefined;
  if (!person) return UNKNOWN;
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    gender: person.gender,
    bornAt: person.bornAt,
    alive: person.alive,
    deceasedAt: person.deceasedAt,
    ethnicity: person.ethnicity,
    isPlayer: false,
    person,
    player: null,
  };
}

export const fullName = (identity: Pick<Identity, 'firstName' | 'lastName'>): string =>
  `${identity.firstName} ${identity.lastName}`.trim();

/** Age now, or age at death. */
export const ageOf = (identity: Pick<Identity, 'bornAt' | 'deceasedAt'>, t: number): number =>
  yearsBetween(identity.bornAt, identity.deceasedAt ?? t);

export function relationshipsOfKind(graph: FamilyGraph, ...kinds: readonly RelationshipKind[]): RelationshipEntity[] {
  return graph.relationships.filter((rel) => kinds.includes(rel.kind));
}

const PARTNER_PRIORITY: Readonly<Partial<Record<RelationshipKind, number>>> = { spouse: 3, fiance: 2, partner: 1 };

/** Current romantic partner (spouse > fiancé(e) > partner) who is alive, if any. */
export function currentPartner(graph: FamilyGraph): RelationshipEntity | null {
  let best: RelationshipEntity | null = null;
  for (const rel of graph.relationships) {
    const priority = PARTNER_PRIORITY[rel.kind];
    if (!priority || !identityOf(graph, rel).alive) continue;
    if (!best || priority > (PARTNER_PRIORITY[best.kind] ?? 0)) best = rel;
  }
  return best;
}

/** How a family member is addressed at home. */
export function familyTitle(kind: RelationshipKind, identity: Pick<Identity, 'firstName' | 'gender'>): string {
  switch (kind) {
    case 'mother':
      return 'Mummy';
    case 'father':
      return 'Daddy';
    case 'grandparent':
      return identity.gender === 'female' ? 'Grandma' : 'Grandpa';
    default:
      return identity.firstName;
  }
}
