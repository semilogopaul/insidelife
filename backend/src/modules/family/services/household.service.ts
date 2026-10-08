import { Injectable } from '@nestjs/common';
import { CHILD_SCHOOLS, WEDDINGS, yearsBetween, type RelationshipStatus } from '@insidelife/shared';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import type { MarriageEntity } from '../entities/marriage.entity.js';
import type { PersonEntity } from '../entities/person.entity.js';
import type { RelationshipEntity } from '../entities/relationship.entity.js';
import { currentPartner, fullName, identityOf, relationshipsOfKind } from '../interfaces/family-graph.js';
import { householdLivingMultiplier } from '../rules/household.rules.js';
import { attendsSchool } from '../rules/school.rules.js';
import { MarriagesService } from './marriages.service.js';
import { HOUSEHOLD_KEY, RelationshipsService } from './relationships.service.js';

/** Clout from family life: a marriage, children, children in good schools. */
const MARRIED_STATUS = 40;
const ENGAGED_STATUS = 10;
const DATING_STATUS = 5;
const STATUS_PER_CHILD = 8;
const MAX_CHILD_STATUS = 48;

export interface HouseholdState {
  readonly status: RelationshipStatus;
  readonly partner: RelationshipEntity | null;
  readonly partnerName: string | null;
  readonly marriage: MarriageEntity | null;
  /** NPC spouse with an income (shares the bills). */
  readonly spouseWorking: boolean;
  /** NPC spouse at home (free childcare). */
  readonly spouseStaysHome: boolean;
  /** Children (and young siblings after a succession) whose school fees you pay. */
  readonly wards: readonly PersonEntity[];
  readonly childrenCount: number;
}

/** Derived household facts, memoised per session (living costs ask for them every game day). */
@Injectable()
export class HouseholdService {
  constructor(
    private readonly relationships: RelationshipsService,
    private readonly marriages: MarriagesService,
  ) {}

  state(ctx: SimulationContext): Promise<HouseholdState> {
    return ctx.memo(HOUSEHOLD_KEY, () => this.load(ctx));
  }

  /** Wards under 18 at `t` — each adds to living costs. */
  dependants(state: HouseholdState, t: number): readonly PersonEntity[] {
    return state.wards.filter((ward) => yearsBetween(ward.bornAt, t) < 18);
  }

  async livingCostMultiplier(ctx: SimulationContext): Promise<number> {
    const state = await this.state(ctx);
    return householdLivingMultiplier(state.spouseWorking, this.dependants(state, ctx.time).length);
  }

  async statusPoints(ctx: SimulationContext): Promise<number> {
    const state = await this.state(ctx);
    let points = 0;
    if (state.status === 'married') {
      const tier = state.marriage?.weddingTier;
      points += MARRIED_STATUS + (tier ? Math.round(WEDDINGS[tier].status / 2) : 0) + (state.marriage?.traditional ? 10 : 0);
    } else if (state.status === 'engaged') points += ENGAGED_STATUS;
    else if (state.status === 'dating') points += DATING_STATUS;
    points += Math.min(MAX_CHILD_STATUS, state.childrenCount * STATUS_PER_CHILD);
    for (const ward of state.wards) {
      if (attendsSchool(yearsBetween(ward.bornAt, ctx.time))) points += CHILD_SCHOOLS[ward.schoolTier].status;
    }
    return points;
  }

  private async load(ctx: SimulationContext): Promise<HouseholdState> {
    const graph = await this.relationships.graph(ctx);
    const partner = currentPartner(graph);
    const marriage = await this.marriages.active(ctx);
    const partnerIdentity = partner ? identityOf(graph, partner) : null;

    let status: RelationshipStatus = 'single';
    if (partner?.kind === 'spouse') status = 'married';
    else if (partner?.kind === 'fiance') status = 'engaged';
    else if (partner?.kind === 'partner') status = 'dating';
    else {
      const latest = await this.marriages.latest(ctx);
      if (latest?.status === 'widowed') status = 'widowed';
      else if (latest?.status === 'divorced') status = 'divorced';
    }

    const spousePerson = partner?.kind === 'spouse' ? partnerIdentity?.person : null;
    const me = ctx.character.id;
    const wards = [...graph.people.values()].filter((person) => person.alive && person.guardianCharacterId === me && person.characterId === null);
    const childrenCount = relationshipsOfKind(graph, 'child').filter((rel) => identityOf(graph, rel).alive).length;

    return {
      status,
      partner,
      partnerName: partnerIdentity ? fullName(partnerIdentity) : null,
      marriage,
      spouseWorking: !!spousePerson && spousePerson.monthlyIncome > 0,
      spouseStaysHome: !!spousePerson && spousePerson.monthlyIncome <= 0,
      wards,
      childrenCount,
    };
  }
}
