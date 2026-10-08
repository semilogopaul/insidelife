import { Injectable } from '@nestjs/common';
import {
  FUNERALS,
  FUNERAL_CHILD_SHARE,
  GENDERS,
  LAGOS_ETHNIC_MIX,
  MINUTES_PER_YEAR,
  PARENT_FUNERAL_TIER,
  TRAITS,
  ethnicityOfState,
  findVenue,
  formatNaira,
  generateName,
  isFamilyKind,
  pickTraits,
  yearsBetween,
  type Ethnicity,
  type Gender,
  type PersonTrait,
  type Rng,
  type VenueType,
} from '@insidelife/shared';
import type { ActivityState } from '../../characters/entities/character.entity.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import type { PersonEntity } from '../entities/person.entity.js';
import type { RelationshipEntity } from '../entities/relationship.entity.js';
import { addMood, adjustConnections } from '../family.util.js';
import { familyTitle, fullName, identityOf, relationshipsOfKind, type FamilyGraph } from '../interfaces/family-graph.js';
import { dailyDeathChance } from '../rules/mortality.rules.js';
import { parentOccupation, siblingCount, siblingOccupation, strangerProfile } from '../rules/people.rules.js';
import { FamilyTriggersService } from './family-triggers.service.js';
import { MarriagesService } from './marriages.service.js';
import { RelationshipsService } from './relationships.service.js';

/** Most non-family people a character keeps track of (Lagos is big; your phone book is not). */
const MAX_ACQUAINTANCES = 80;
const FAMILY_CALL_CLOSENESS = 4;
const GRIEF_DAYS = 21;

/** Overrides for matchmaking (Mummy's candidate is single, of the opposite sex and family-oriented). */
export interface StrangerOptions {
  readonly romance?: number;
  readonly closeness?: number;
  readonly trait?: PersonTrait;
  readonly gender?: Gender;
  readonly available?: boolean;
}

export interface Introduction {
  readonly rel: RelationshipEntity;
  readonly person: PersonEntity;
}

const FAMILY_GIST = [
  'Mummy says you should drink water and stop eating noodles.',
  'Daddy wants to know when you’re buying him a car. He’s joking. He’s not joking.',
  'Your sibling wants data. Again.',
  'Grandma prayed for you for 15 minutes. You put the phone on speaker.',
  'Mummy asked if you’re eating well. You lied.',
];

/**
 * The people in a character's life: the family they're born into, the people they meet around Lagos, and the
 * natural cycle of life (parents age and pass on).
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly relationships: RelationshipsService,
    private readonly triggers: FamilyTriggersService,
    private readonly marriages: MarriagesService,
  ) {}

  /** Parents (40-55) and 0-3 siblings for a brand-new character; names follow the state of origin's people. */
  async seedFamily(ctx: SimulationContext): Promise<void> {
    const character = ctx.character;
    const rng = ctx.rng('family-seed');
    const ethnicity = ethnicityOfState(character.stateOfOrigin);
    const age = ctx.age;
    const surname = character.lastName;
    const usedNames = new Set<string>([character.firstName]);

    const fatherAge = rng.int(Math.max(43, age + 24), 55);
    const motherAge = Math.max(40, Math.min(52, fatherAge - rng.int(2, 8)));
    const motherEthnicity: Ethnicity = rng.chance(0.85) ? ethnicity : rng.weighted(LAGOS_ETHNIC_MIX);

    const father = await this.createRelative(ctx, rng, { gender: 'male', ethnicity, age: fatherAge, surname, usedNames, parents: [] });
    const mother = await this.createRelative(ctx, rng, { gender: 'female', ethnicity: motherEthnicity, age: motherAge, surname, usedNames, parents: [] });
    await this.relationships.create(ctx, { personId: father.id, kind: 'father', closeness: rng.int(50, 80), metAt: 'family', since: character.bornAt });
    await this.relationships.create(ctx, { personId: mother.id, kind: 'mother', closeness: rng.int(60, 85), metAt: 'family', since: character.bornAt });

    const count = siblingCount(rng, character.background);
    for (let index = 0; index < count; index++) {
      const siblingAge = rng.int(Math.max(4, age - 12), Math.min(motherAge - 19, age + 10));
      const sibling = await this.createRelative(ctx, rng, {
        gender: rng.pick(GENDERS),
        ethnicity,
        age: siblingAge,
        surname,
        usedNames,
        parents: [father.id, mother.id],
      });
      await this.relationships.create(ctx, {
        personId: sibling.id,
        kind: 'sibling',
        closeness: rng.int(40, 75),
        metAt: 'family',
        since: Math.max(character.bornAt, sibling.bornAt),
      });
    }
  }

  /** `meet-people` hook: maybe meet someone new at this venue (Mingle is the best bet), or bump into someone again. */
  async meet(ctx: SimulationContext, activity: ActivityState, primary: boolean): Promise<void> {
    const venue = findVenue(activity.locationId);
    if (!venue) return;
    const rng = ctx.rng('meet', activity.startedAt, activity.actionId);
    const graph = await this.relationships.graph(ctx);
    const known = graph.relationships.filter((rel) => !isFamilyKind(rel.kind) && rel.personId);
    const charisma = ctx.character.skills.charisma;
    const chance = primary ? Math.min(0.85, 0.55 + charisma / 250) : Math.min(0.35, 0.12 + charisma / 500);

    if (known.length < MAX_ACQUAINTANCES && rng.chance(chance)) {
      const { rel, person } = await this.introduceStranger(ctx, rng, venue.type, venue.id, venue.minStatus ?? 0);
      const age = yearsBetween(person.bornAt, ctx.time);
      const traits = person.traits.map((trait) => TRAITS[trait].label.toLowerCase()).join(' and ');
      const vibe = rel.romance > 0 ? ' There was a vibe 👀' : '';
      ctx.notify({
        kind: 'relationship',
        title: `New connection: ${person.firstName}`,
        body: `You met ${fullName(person)} (${age}, ${(person.occupation ?? 'hustling').toLowerCase()}) at ${venue.name}. ${capitalise(traits)}.${vibe}`,
        tone: 'good',
      });
      adjustConnections(ctx, 0.4);
      return;
    }

    const regulars = known.filter((rel) => rel.metAt === venue.id && identityOf(graph, rel).alive);
    if (regulars.length > 0 && rng.chance(0.5)) {
      const rel = rng.pick(regulars);
      this.relationships.touch(graph, rel, ctx.time, { closeness: 3 });
      await this.relationships.save(ctx, rel);
      ctx.report({ label: `Bumped into ${identityOf(graph, rel).firstName} again at ${venue.name}`, tone: 'good' });
    }
  }

  /** Create a stranger at a venue type and the acquaintance relationship. Used by mingling, owambes and matchmaking. */
  async introduceStranger(
    ctx: SimulationContext,
    rng: Rng,
    venueType: VenueType,
    metAt: string,
    minStatus = 0,
    options: StrangerOptions = {},
  ): Promise<Introduction> {
    const profile = strangerProfile(rng, venueType, ctx.age, minStatus);
    const traits = options.trait && !profile.traits.includes(options.trait) ? [options.trait, ...profile.traits].slice(0, 3) : [...profile.traits];
    const gender = options.gender ?? profile.gender;
    const name = gender === profile.gender ? profile.name : generateName(rng, profile.ethnicity, gender);
    const available = options.available ?? profile.available;
    const person = await this.relationships.createPerson(ctx, {
      ownerCharacterId: ctx.character.id,
      firstName: name.firstName,
      lastName: name.lastName,
      gender,
      bornAt: ctx.time - profile.age * MINUTES_PER_YEAR - rng.int(0, MINUTES_PER_YEAR - 1),
      ethnicity: profile.ethnicity,
      traits,
      occupation: profile.occupation.title,
      monthlyIncome: profile.occupation.monthlyIncome,
      wealth: profile.occupation.wealth,
      available,
      parentPersonIds: [],
      parentCharacterIds: [],
    });
    const adults = profile.age >= 18 && ctx.age >= 18;
    const vibe = adults && available && rng.chance(traits.includes('romantic') ? 0.4 : 0.25);
    const rel = await this.relationships.create(ctx, {
      personId: person.id,
      kind: 'acquaintance',
      closeness: options.closeness ?? rng.int(8, 18) + (traits.includes('funny') ? 5 : 0),
      romance: adults ? (options.romance ?? (vibe ? rng.int(5, 15) : 0)) : 0,
      metAt,
    });
    return { rel, person };
  }

  /** `family-call` hook: parents, grandparents and siblings all feel closer. */
  async familyCall(ctx: SimulationContext): Promise<void> {
    const graph = await this.relationships.graph(ctx);
    const family = relationshipsOfKind(graph, 'father', 'mother', 'grandparent', 'sibling').filter((rel) => identityOf(graph, rel).alive);
    if (family.length === 0) return;
    for (const rel of family) this.relationships.touch(graph, rel, ctx.time, { closeness: FAMILY_CALL_CLOSENESS });
    await this.relationships.save(ctx, ...family);
    const rng = ctx.rng('family-call', ctx.time);
    if (rng.chance(0.5)) {
      ctx.notify({ kind: 'family', title: 'Family call', body: rng.pick(FAMILY_GIST), tone: 'good' });
    }
  }

  /** `worship` hook: community connections, a lift in spirit, and church/mosque friends feel closer. */
  async worship(ctx: SimulationContext, activity: ActivityState): Promise<void> {
    adjustConnections(ctx, 0.6);
    addMood(ctx, 'worship', 'Spiritually refreshed', 4, 1);
    const graph = await this.relationships.graph(ctx);
    const congregation = graph.relationships
      .filter((rel) => {
        const identity = identityOf(graph, rel);
        return identity.alive && (rel.metAt === activity.locationId || (identity.person?.traits.includes('religious') ?? false));
      })
      .slice(0, 6);
    for (const rel of congregation) this.relationships.touch(graph, rel, ctx.time, { closeness: 2 });
    await this.relationships.save(ctx, ...congregation);
  }

  /** Parents, grandparents and an NPC spouse age; occasionally one passes on. */
  async dailyMortality(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const graph = await this.relationships.graph(ctx);
    for (const rel of relationshipsOfKind(graph, 'father', 'mother', 'grandparent', 'spouse')) {
      const person = rel.personId ? graph.people.get(rel.personId) : undefined;
      if (!person?.alive || person.characterId) continue;
      const age = yearsBetween(person.bornAt, ctx.time);
      if (ctx.rng('npc-death', person.id, dayIndex).chance(dailyDeathChance(age))) await this.passAway(ctx, graph, rel, person);
    }
  }

  /** An NPC in the family dies: grief, a funeral the family expects you to contribute to, widowhood for a spouse. */
  async passAway(ctx: SimulationContext, graph: FamilyGraph, rel: RelationshipEntity, person: PersonEntity): Promise<void> {
    person.alive = false;
    person.deceasedAt = ctx.time;
    person.available = false;
    await this.relationships.savePeople(ctx, person);
    const title = familyTitle(rel.kind, person);
    const age = yearsBetween(person.bornAt, ctx.time);

    addMood(ctx, `grief:${person.id}`, `Grieving ${title === person.firstName ? person.firstName : title}`, -20, GRIEF_DAYS);
    ctx.notify({
      kind: 'family',
      title: rel.kind === 'spouse' ? `${person.firstName} has passed away` : `${title} has passed on`,
      body: `${fullName(person)} died peacefully at ${age}. The family is gathering. Sun re o.`,
      tone: 'bad',
    });
    ctx.report({ label: `${fullName(person)} passed away`, tone: 'bad' });

    if (rel.kind === 'spouse') {
      const marriage = await this.marriages.active(ctx);
      if (marriage && marriage.spousePersonId === person.id) await this.marriages.end(ctx, marriage, 'widowed');
      this.relationships.setFlags(rel, { pregnancyDueAt: undefined });
      await this.relationships.save(ctx, rel);
      this.relationships.householdChanged(ctx);
    }

    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    const tier = PARENT_FUNERAL_TIER[ctx.character.background];
    const total = Math.round((FUNERALS[tier].cost * priceIndex) / 1_000) * 1_000;
    const share = rel.kind === 'spouse' ? 0.7 : rel.kind === 'grandparent' ? 0.1 : FUNERAL_CHILD_SHARE;
    const expected = Math.max(10_000, Math.round((total * share) / 1_000) * 1_000);
    await this.triggers.enqueue(ctx, 'family-funeral', `funeral:${person.id}`, {
      personId: person.id,
      relationshipId: rel.id,
      name: fullName(person),
      title,
      relation: rel.kind,
      funeralTier: tier,
      total,
      expected,
      modest: Math.round(expected / 2_000) * 1_000,
      totalLabel: formatNaira(total),
    });
  }

  private async createRelative(
    ctx: SimulationContext,
    rng: Rng,
    spec: {
      readonly gender: Gender;
      readonly ethnicity: Ethnicity;
      readonly age: number;
      readonly surname: string;
      readonly usedNames: Set<string>;
      readonly parents: readonly string[];
    },
  ): Promise<PersonEntity> {
    const name = generateName(rng, spec.ethnicity, spec.gender, { surname: spec.surname, avoid: spec.usedNames });
    spec.usedNames.add(name.firstName);
    const isParent = spec.parents.length === 0;
    const occupation = isParent ? parentOccupation(rng, ctx.character.background, spec.gender) : siblingOccupation(rng, spec.age);
    return this.relationships.createPerson(ctx, {
      ownerCharacterId: ctx.character.id,
      firstName: name.firstName,
      lastName: name.lastName,
      gender: spec.gender,
      bornAt: ctx.time - spec.age * MINUTES_PER_YEAR - rng.int(0, MINUTES_PER_YEAR - 1),
      ethnicity: spec.ethnicity,
      traits: pickTraits(rng, rng.int(1, 2), isParent && rng.chance(0.5) ? 'family-oriented' : undefined),
      occupation: occupation.title,
      monthlyIncome: occupation.monthlyIncome,
      wealth: occupation.wealth,
      available: !isParent && spec.age >= 18 && rng.chance(0.7),
      parentPersonIds: [...spec.parents],
      parentCharacterIds: [],
    });
  }
}

function capitalise(text: string): string {
  return text.length > 0 ? `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}` : text;
}
