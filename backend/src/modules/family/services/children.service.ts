import { Injectable } from '@nestjs/common';
import {
  CHILDCARE_MAX_AGE,
  CHILD_MILESTONES,
  CHILD_SCHOOLS,
  DEFAULT_CHILD_SCHOOL,
  GENDERS,
  MINUTES_PER_MONTH,
  NAMING_CEREMONIES,
  WAEC_AGE,
  dayIndexOf,
  ethnicityOfState,
  formatNaira,
  generateName,
  pickTraits,
  yearsBetween,
  type ChildSchoolTier,
  type Ethnicity,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import type { PersonEntity } from '../entities/person.entity.js';
import type { RelationshipEntity } from '../entities/relationship.entity.js';
import { addMood, adjustStatus, fill } from '../family.util.js';
import { fullName, identityOf, relationshipsOfKind, type FamilyGraph, type PlayerRef } from '../interfaces/family-graph.js';
import { childcareMonthlyBase } from '../rules/household.rules.js';
import { attendsSchool, driftPerformance, isTermStartDay, termFee, termIndexOfDay, waecCredits } from '../rules/school.rules.js';
import { FamilyTriggersService } from './family-triggers.service.js';
import { HouseholdService } from './household.service.js';
import { PlayerNotifier } from './player-notifier.service.js';
import { RelationshipsService } from './relationships.service.js';

/** The other parent of a new baby. */
export type OtherParent =
  | { readonly kind: 'npc'; readonly rel: RelationshipEntity; readonly person: PersonEntity }
  | { readonly kind: 'player'; readonly rel: RelationshipEntity | null; readonly player: PlayerRef }
  | { readonly kind: 'unknown' };

export interface ChildEntry {
  readonly rel: RelationshipEntity;
  readonly person: PersonEntity;
}

/**
 * Children: births, naming ceremonies, milestones, school terms (3 a year at the chosen tier), childcare and WAEC
 * at 17. The guardian (the birthing parent for player couples) pays; the other parent sees everything.
 */
@Injectable()
export class ChildrenService {
  constructor(
    private readonly relationships: RelationshipsService,
    private readonly household: HouseholdService,
    private readonly triggers: FamilyTriggersService,
    private readonly notifier: PlayerNotifier,
  ) {}

  children(graph: FamilyGraph): ChildEntry[] {
    return relationshipsOfKind(graph, 'child').flatMap((rel) => {
      const person = rel.personId ? graph.people.get(rel.personId) : undefined;
      return person ? [{ rel, person }] : [];
    });
  }

  /** The eldest living child who isn't already a player — continues the dynasty. */
  heirCandidate(graph: FamilyGraph): ChildEntry | null {
    const candidates = this.children(graph)
      .filter(({ person }) => person.alive && person.characterId === null)
      .toSorted((a, b) => a.person.bornAt - b.person.bornAt);
    return candidates[0] ?? null;
  }

  /** A baby is born to this character. Names follow the father's people; the naming ceremony card follows. */
  async createChild(ctx: SimulationContext, other: OtherParent): Promise<ChildEntry> {
    const character = ctx.character;
    const graph = await this.relationships.graph(ctx);
    const rng = ctx.rng('birth', ctx.time);
    const myEthnicity = ethnicityOfState(character.stateOfOrigin);

    let fatherEthnicity: Ethnicity = myEthnicity;
    let surname = character.lastName;
    if (character.gender === 'female') {
      if (other.kind === 'npc') {
        fatherEthnicity = other.person.ethnicity;
        surname = other.person.lastName;
      } else if (other.kind === 'player') {
        fatherEthnicity = ethnicityOfState(other.player.stateOfOrigin);
        surname = other.player.lastName;
      }
    }

    const siblings = new Set(this.children(graph).map(({ person }) => person.firstName));
    const gender = rng.pick(GENDERS);
    const name = generateName(rng, fatherEthnicity, gender, { surname, avoid: siblings });
    const person = await this.relationships.createPerson(ctx, {
      ownerCharacterId: character.id,
      firstName: name.firstName,
      lastName: name.lastName,
      gender,
      bornAt: ctx.time,
      ethnicity: fatherEthnicity,
      traits: pickTraits(rng, 1),
      available: false,
      schoolTier: DEFAULT_CHILD_SCHOOL[character.background],
      schoolPerformance: 0.5,
      guardianCharacterId: character.id,
      parentCharacterIds: other.kind === 'player' ? [character.id, other.player.id] : [character.id],
      parentPersonIds: other.kind === 'npc' ? [other.person.id] : [],
    });
    const rel = await this.relationships.create(ctx, { personId: person.id, kind: 'child', closeness: 80, metAt: 'family' });

    if (other.kind === 'npc') {
      this.relationships.touch(graph, other.rel, ctx.time, { closeness: 10, romance: 5 });
      await this.relationships.save(ctx, other.rel);
    }
    addMood(ctx, 'new-baby', `New baby: ${person.firstName}`, 15, 14);
    ctx.notify({
      kind: 'family',
      title: `It’s a ${gender === 'male' ? 'boy' : 'girl'}! Welcome, ${person.firstName}`,
      body: `${fullName(person)} has arrived. Grandma is already on her way with pap and agbo.`,
      tone: 'good',
    });
    ctx.report({ label: `${fullName(person)} was born`, tone: 'good' });

    if (other.kind === 'player') {
      await this.notifier.notify(ctx, other.player.id, {
        kind: 'family',
        title: `You’re a parent! Welcome, ${person.firstName}`,
        body: `${character.firstName} gave birth to ${fullName(person)}. Congratulations!`,
        tone: 'good',
      });
    }

    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    const cost = (tier: keyof typeof NAMING_CEREMONIES): number => Math.round((NAMING_CEREMONIES[tier].cost * priceIndex) / 1_000) * 1_000;
    await this.triggers.enqueue(ctx, 'family-naming-ceremony', `naming:${person.id}`, {
      childId: person.id,
      childName: person.firstName,
      fullName: fullName(person),
      prayers: cost('prayers'),
      intimate: cost('intimate'),
      standard: cost('standard'),
      grand: cost('grand'),
    });
    this.relationships.householdChanged(ctx);
    return { rel, person };
  }

  /** Daily: NPC partners give birth, children reach milestones, and on the first day of term school fees are due. */
  async daily(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const graph = await this.relationships.graph(ctx);
    // Snapshot: births below add relationships to the graph while we iterate.
    for (const rel of graph.relationships.slice()) {
      const due = rel.flags.pregnancyDueAt;
      if (due === undefined || due > ctx.time) continue;
      this.relationships.setFlags(rel, { pregnancyDueAt: undefined });
      await this.relationships.save(ctx, rel);
      const person = rel.personId ? graph.people.get(rel.personId) : undefined;
      if (person?.alive) await this.createChild(ctx, { kind: 'npc', rel, person });
    }

    const state = await this.household.state(ctx);
    if (state.wards.length === 0) return;
    const startingDay = dayIndex + 1;
    const termStarts = isTermStartDay(startingDay);
    const term = termIndexOfDay(startingDay);
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    const changed: PersonEntity[] = [];

    for (const ward of state.wards) {
      let dirty = this.reachMilestones(ctx, ward);
      if (termStarts) dirty = (await this.chargeTerm(ctx, ward, term, priceIndex)) || dirty;
      if (dirty) changed.push(ward);
    }
    await this.relationships.savePeople(ctx, ...changed);
    if (changed.length > 0) this.relationships.householdChanged(ctx);
  }

  /** Monthly nanny while any ward is under 5 — free if you or your spouse stay home; Grandma steps in if you can't pay. */
  async monthlyChildcare(ctx: SimulationContext, monthIndex: number, playerStaysHome: boolean): Promise<void> {
    const state = await this.household.state(ctx);
    const little = state.wards.filter((ward) => yearsBetween(ward.bornAt, ctx.time) < CHILDCARE_MAX_AGE);
    const base = childcareMonthlyBase(little.length, playerStaysHome || state.spouseStaysHome);
    if (base <= 0) return;
    const cost = ctx.world.price(base, ctx.time);
    const label = little.length === 1 ? `Nanny for ${little[0]?.firstName ?? 'the baby'}` : `Nanny for ${little.length} little ones`;
    if (await ctx.wallet.tryPay(cost, 'living-cost', label, `childcare:${monthIndex}`)) {
      ctx.report({ label, amount: -cost, tone: 'neutral' });
      return;
    }
    addMood(ctx, 'grandma-help', 'Grandma moved in to help', -3, 7);
    ctx.notify({
      kind: 'family',
      title: 'Grandma to the rescue',
      body: `You couldn’t afford the nanny (${formatNaira(cost)}), so Grandma moved in. Free childcare — but she has rearranged your kitchen.`,
      tone: 'neutral',
    });
    const graph = await this.relationships.graph(ctx);
    const mother = relationshipsOfKind(graph, 'mother').find((rel) => identityOf(graph, rel).alive);
    if (mother) {
      this.relationships.touch(graph, mother, ctx.time, { closeness: 3 });
      await this.relationships.save(ctx, mother);
    }
  }

  /** Choose a child's school (takes effect next term; a child sent home is re-admitted if the new fee is paid now). */
  async setSchoolTier(ctx: SimulationContext, childId: string, tier: ChildSchoolTier): Promise<PersonEntity> {
    const graph = await this.relationships.graph(ctx);
    const rel = this.relationships.find(graph, childId);
    const person = rel?.personId ? graph.people.get(rel.personId) : undefined;
    if (!rel || !person || (rel.kind !== 'child' && person.guardianCharacterId !== ctx.character.id)) throw new ResourceNotFoundException('Child');
    if (!person.alive) throw new GameRuleException('DECEASED', `${person.firstName} has passed on.`);
    if (person.guardianCharacterId !== ctx.character.id) {
      throw new GameRuleException('NOT_GUARDIAN', `${person.firstName}’s fees are paid by the other parent — ask them to change schools.`);
    }
    const age = yearsBetween(person.bornAt, ctx.time);
    if (age > WAEC_AGE || person.characterId) throw new GameRuleException('FINISHED_SCHOOL', `${person.firstName} has finished secondary school.`);

    person.schoolTier = tier;
    const term = termIndexOfDay(dayIndexOf(ctx.time));
    if (person.sentHomeTerm !== null && attendsSchool(age)) {
      const fee = termFee(tier, ctx.world.economy(ctx.time).priceIndex);
      const paid = await ctx.wallet.tryPay(fee, 'school-fees', `${CHILD_SCHOOLS[tier].label} fees — ${person.firstName}`, `school-fees:${person.id}:${term}:${tier}`);
      if (paid || tier === 'none') person.sentHomeTerm = null;
    }
    await this.relationships.savePeople(ctx, person);
    this.relationships.householdChanged(ctx);
    return person;
  }

  /** Pay a sent-home child's fees for the term (life-event "pay now"). */
  async readmit(ctx: SimulationContext, childId: string, fee: number, term: number): Promise<boolean> {
    const graph = await this.relationships.graph(ctx);
    const person = graph.people.get(childId);
    if (!person) return false;
    const paid = await ctx.wallet.tryPay(fee, 'school-fees', `School fees — ${person.firstName} (balance)`, `school-fees:${person.id}:${term}`);
    if (paid) {
      person.sentHomeTerm = null;
      await this.relationships.savePeople(ctx, person);
    }
    return paid;
  }

  /** Move a child to public school (life-event choice). */
  async moveToPublic(ctx: SimulationContext, childId: string): Promise<void> {
    const graph = await this.relationships.graph(ctx);
    const person = graph.people.get(childId);
    if (!person) return;
    person.schoolTier = 'public';
    person.sentHomeTerm = null;
    await this.relationships.savePeople(ctx, person);
    this.relationships.householdChanged(ctx);
  }

  private reachMilestones(ctx: SimulationContext, ward: PersonEntity): boolean {
    const ageMonths = Math.floor((ctx.time - ward.bornAt) / MINUTES_PER_MONTH);
    const due = CHILD_MILESTONES.filter((milestone) => milestone.ageMonths <= ageMonths && !ward.milestones.includes(milestone.id));
    if (due.length === 0) return false;
    ward.milestones = [...ward.milestones, ...due.map((milestone) => milestone.id)];
    let credits = 0;
    if (due.some((milestone) => milestone.id === 'waec')) {
      credits = waecCredits(ward.schoolPerformance, ctx.rng('waec', ward.id));
      ward.waecCredits = credits;
      ward.schoolTier = 'none';
      if (credits >= 7) {
        adjustStatus(ctx, 5);
        addMood(ctx, `proud:${ward.id}`, `Proud of ${ward.firstName}`, 8, 7);
      }
    }
    const latest = due[due.length - 1];
    if (latest) {
      ctx.notify({
        kind: 'family',
        title: latest.title,
        body: fill(latest.body, { name: ward.firstName, credits }),
        tone: latest.id === 'waec' && credits < 5 ? 'neutral' : 'good',
      });
    }
    return true;
  }

  private async chargeTerm(ctx: SimulationContext, ward: PersonEntity, term: number, priceIndex: number): Promise<boolean> {
    const age = yearsBetween(ward.bornAt, ctx.time);
    if (!attendsSchool(age) || ward.schoolTier === 'none') return false;
    const fee = termFee(ward.schoolTier, priceIndex);
    const label = `${CHILD_SCHOOLS[ward.schoolTier].label} fees — ${ward.firstName}`;
    const paid = await ctx.wallet.tryPay(fee, 'school-fees', label, `school-fees:${ward.id}:${term}`);
    ward.schoolPerformance = driftPerformance(ward.schoolPerformance, ward.schoolTier, !paid);
    if (paid) {
      ward.sentHomeTerm = null;
      ctx.report({ label, amount: -fee, tone: 'neutral' });
      return true;
    }
    ward.sentHomeTerm = term;
    ctx.notify({
      kind: 'family',
      title: `${ward.firstName} was sent home`,
      body: `The school sent ${ward.firstName} home: ${formatNaira(fee)} fees unpaid. The proprietor “regrets the inconvenience”.`,
      tone: 'bad',
    });
    await this.triggers.enqueue(ctx, 'family-child-sent-home', `sent-home:${ward.id}:${term}`, {
      childId: ward.id,
      childName: ward.firstName,
      fee,
      term,
      school: CHILD_SCHOOLS[ward.schoolTier].label,
      publicFee: termFee('public', priceIndex),
    });
    return true;
  }
}
