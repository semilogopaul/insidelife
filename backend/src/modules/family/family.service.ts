import { Inject, Injectable } from '@nestjs/common';
import {
  CHILDCARE_MAX_AGE,
  MINUTES_PER_DAY,
  dayIndexOf,
  yearsBetween,
  type ChildSchoolTier,
  type FamilyTreeDto,
  type RelationshipDto,
  type RelationshipKind,
} from '@insidelife/shared';
import { EMPLOYMENT_PORT, type EmploymentPort } from '../../common/ports/employment.port.js';
import type { FamilyMember, FamilyPort, FamilySnapshot } from '../../common/ports/family.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { RelationshipEntity } from './entities/relationship.entity.js';
import { toChildDto, toPersonDto, toRelationshipDto } from './family.mapper.js';
import { ageOf, fullName, identityOf, relationshipsOfKind, type FamilyGraph } from './interfaces/family-graph.js';
import { childcareMonthlyBase, householdLivingMultiplier } from './rules/household.rules.js';
import { attendsSchool, nextTermStartDay, termFee, termIndexOfDay } from './rules/school.rules.js';
import { ChildrenService, type OtherParent } from './services/children.service.js';
import { HouseholdService } from './services/household.service.js';
import { PlayerLinksService } from './services/player-links.service.js';
import { RelationshipsService } from './services/relationships.service.js';

const PORT_RELATIONS: Readonly<Partial<Record<RelationshipKind, FamilyMember['relation']>>> = {
  father: 'father',
  mother: 'mother',
  sibling: 'sibling',
  partner: 'partner',
  fiance: 'partner',
  spouse: 'spouse',
  child: 'child',
};

/** Order relationships are listed in (family first, then love, then everyone else). */
const KIND_ORDER: readonly RelationshipKind[] = ['spouse', 'fiance', 'partner', 'child', 'mother', 'father', 'sibling', 'grandparent', 'friend', 'acquaintance', 'ex'];

/**
 * The family domain's public face: `FAMILY_PORT` for other domains (snapshot, closeness, births) and the read models
 * behind the Family app (tree, relationships).
 */
@Injectable()
export class FamilyService implements FamilyPort {
  constructor(
    @Inject(EMPLOYMENT_PORT) private readonly employment: EmploymentPort,
    private readonly relationships: RelationshipsService,
    private readonly household: HouseholdService,
    private readonly children: ChildrenService,
    private readonly links: PlayerLinksService,
  ) {}

  async snapshot(ctx: SimulationContext): Promise<FamilySnapshot> {
    await this.links.reconcile(ctx);
    const graph = await this.relationships.graph(ctx);
    const state = await this.household.state(ctx);
    const members = graph.relationships.flatMap((rel) => {
      const member = this.member(graph, rel, ctx.time);
      return member ? [member] : [];
    });
    return {
      members,
      relationship: state.status,
      partner: state.partner ? this.member(graph, state.partner, ctx.time) : null,
      children: members.filter((member) => member.relation === 'child'),
    };
  }

  async adjustCloseness(ctx: SimulationContext, memberId: string, delta: number): Promise<void> {
    const graph = await this.relationships.graph(ctx);
    const rel = this.relationships.find(graph, memberId);
    if (!rel) return;
    this.relationships.touch(graph, rel, ctx.time, { closeness: delta });
    await this.relationships.save(ctx, rel);
  }

  /** Called by the health module when this character gives birth. */
  async recordBirth(ctx: SimulationContext, partnerName: string): Promise<void> {
    await this.links.reconcile(ctx);
    const graph = await this.relationships.graph(ctx);
    const wanted = partnerName.trim().toLowerCase();
    const candidates = relationshipsOfKind(graph, 'spouse', 'fiance', 'partner', 'ex');
    const named = candidates.filter((rel) => {
      const identity = identityOf(graph, rel);
      return fullName(identity).toLowerCase() === wanted || identity.firstName.toLowerCase() === wanted;
    });
    const rel = named.find((candidate) => candidate.kind !== 'ex') ?? named[0] ?? null;
    let other: OtherParent = { kind: 'unknown' };
    if (rel) {
      const identity = identityOf(graph, rel);
      if (identity.person) other = { kind: 'npc', rel, person: identity.person };
      else if (identity.player) other = { kind: 'player', rel, player: identity.player };
    }
    await this.children.createChild(ctx, other);
  }

  async tree(ctx: SimulationContext): Promise<FamilyTreeDto> {
    await this.links.reconcile(ctx);
    const graph = await this.relationships.graph(ctx);
    const state = await this.household.state(ctx);
    const t = ctx.time;
    const day = dayIndexOf(t);
    const term = termIndexOfDay(day);
    const priceIndex = ctx.world.economy(t).priceIndex;
    const me = ctx.character.id;
    const people = (...kinds: RelationshipKind[]) => relationshipsOfKind(graph, ...kinds).map((rel) => toPersonDto(graph, rel, t));

    const children = this.children
      .children(graph)
      .toSorted((a, b) => a.person.bornAt - b.person.bornAt)
      .map(({ rel, person }) => {
        const inSchool = person.guardianCharacterId === me && attendsSchool(yearsBetween(person.bornAt, t));
        return toChildDto(graph, rel, person, t, me, inSchool ? termFee(person.schoolTier, priceIndex) : 0, term);
      });

    const nextTermDay = nextTermStartDay(day);
    const nextTermAt = nextTermDay * MINUTES_PER_DAY;
    const dependants = this.household.dependants(state, t);
    const littleOnes = state.wards.filter((ward) => yearsBetween(ward.bornAt, t) < CHILDCARE_MAX_AGE).length;
    const playerHome = littleOnes > 0 && (await this.employment.current(ctx)) === null;
    const childcareBase = childcareMonthlyBase(littleOnes, playerHome || state.spouseStaysHome);
    const heir = this.children.heirCandidate(graph);

    return {
      relationshipStatus: state.status,
      partner: state.partner ? toRelationshipDto(graph, state.partner, t) : null,
      parents: people('father', 'mother'),
      grandparents: people('grandparent'),
      siblings: people('sibling'),
      children,
      household: {
        livingCostMultiplier: Math.round(householdLivingMultiplier(state.spouseWorking, dependants.length) * 100) / 100,
        spouseWorking: state.spouseWorking,
        dependants: dependants.length,
        childcarePerMonth: childcareBase > 0 ? ctx.world.price(childcareBase, t) : 0,
        schoolFeesNextTerm: state.wards
          .filter((ward) => attendsSchool(yearsBetween(ward.bornAt, nextTermAt)))
          .reduce((sum, ward) => sum + termFee(ward.schoolTier, priceIndex), 0),
        nextTermStartsAt: nextTermAt,
      },
      heir: heir ? { personId: heir.person.id, name: fullName(heir.person), age: yearsBetween(heir.person.bornAt, t) } : null,
      generation: ctx.character.generation,
    };
  }

  async list(ctx: SimulationContext): Promise<RelationshipDto[]> {
    await this.links.reconcile(ctx);
    const graph = await this.relationships.graph(ctx);
    const t = ctx.time;
    return graph.relationships
      .toSorted((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || this.relationships.closeness(b, t) - this.relationships.closeness(a, t))
      .map((rel) => toRelationshipDto(graph, rel, t));
  }

  async setChildSchool(ctx: SimulationContext, childId: string, tier: ChildSchoolTier): Promise<FamilyTreeDto> {
    await this.children.setSchoolTier(ctx, childId, tier);
    return this.tree(ctx);
  }

  private member(graph: FamilyGraph, rel: RelationshipEntity, t: number): FamilyMember | null {
    const relation = PORT_RELATIONS[rel.kind];
    if (!relation) return null;
    const identity = identityOf(graph, rel);
    return {
      id: rel.id,
      name: fullName(identity),
      relation,
      age: ageOf(identity, t),
      alive: identity.alive,
      characterId: rel.otherCharacterId ?? identity.person?.characterId ?? null,
    };
  }
}
