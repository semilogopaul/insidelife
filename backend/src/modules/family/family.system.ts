import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ActionDefinition } from '@insidelife/shared';
import { EMPLOYMENT_PORT, type EmploymentPort } from '../../common/ports/employment.port.js';
import type { ActivityState } from '../characters/entities/character.entity.js';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import type { SimulationSystem, SummaryContribution } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { familyEvents } from './family.events.js';
import { BLACK_TAX_EVENT, BlackTaxService } from './services/black-tax.service.js';
import { ChildrenService } from './services/children.service.js';
import { FamilyTriggersService } from './services/family-triggers.service.js';
import { HouseholdService } from './services/household.service.js';
import { InteractionsService } from './services/interactions.service.js';
import { MARRIAGE_ROWS } from './services/marriages.service.js';
import { UNSYNCED_ANSWER_ROWS } from './services/player-links.service.js';
import { PeopleService } from './services/people.service.js';
import { PlayerLinksService } from './services/player-links.service.js';
import { RelationshipsService } from './services/relationships.service.js';
import { RomanceService } from './services/romance.service.js';

/** Closeness lost with whoever asked when a family request is ignored for weeks. */
const IGNORED_PENALTY = -4;

/**
 * Family life in the simulation: the family you are born into, people you meet, love and its decay, children growing
 * up and costing money, parents aging, black tax and the household's effect on living costs and clout.
 */
@Injectable()
export class FamilySystem implements SimulationSystem, OnModuleInit {
  readonly key = 'family';
  readonly order = 300;
  readonly rowProbes = [MARRIAGE_ROWS, UNSYNCED_ANSWER_ROWS];

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly lifeEvents: LifeEventsRegistry,
    @Inject(EMPLOYMENT_PORT) private readonly employment: EmploymentPort,
    private readonly relationships: RelationshipsService,
    private readonly people: PeopleService,
    private readonly household: HouseholdService,
    private readonly children: ChildrenService,
    private readonly romance: RomanceService,
    private readonly blackTax: BlackTaxService,
    private readonly links: PlayerLinksService,
    private readonly interactions: InteractionsService,
    private readonly triggers: FamilyTriggersService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.lifeEvents.register(
      ...familyEvents({
        relationships: this.relationships,
        people: this.people,
        children: this.children,
        household: this.household,
        blackTax: this.blackTax,
        triggers: this.triggers,
      }),
    );
  }

  async onCharacterCreated(ctx: SimulationContext): Promise<void> {
    // Heirs inherit their family from the predecessor (wired by the succession service).
    if (ctx.character.predecessorId) return;
    await this.people.seedFamily(ctx);
  }

  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    const hooks = action.hooks ?? [];
    if (hooks.includes('meet-people')) await this.people.meet(ctx, activity, action.id === 'meet-people');
    if (hooks.includes('family-call')) await this.people.familyCall(ctx);
    if (hooks.includes('worship')) await this.people.worship(ctx, activity);
    if (activity.targetId) await this.interactions.onTargetedAction(ctx, action, activity);
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    await this.links.reconcile(ctx);
    await this.people.dailyMortality(ctx, dayIndex);
    await this.romance.daily(ctx, dayIndex);
    await this.children.daily(ctx, dayIndex);
    for (const trigger of await this.triggers.expireStale(ctx)) {
      if (trigger.eventId === BLACK_TAX_EVENT) await this.blackTax.ignored(ctx, trigger.params);
      else if (typeof trigger.params.relationshipId === 'string') {
        const graph = await this.relationships.graph(ctx);
        const rel = this.relationships.find(graph, trigger.params.relationshipId);
        if (rel) {
          this.relationships.touch(graph, rel, ctx.time, { closeness: IGNORED_PENALTY });
          await this.relationships.save(ctx, rel);
        }
      }
    }
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const state = await this.household.state(ctx);
    if (state.wards.length > 0) {
      const playerStaysHome = (await this.employment.current(ctx)) === null;
      await this.children.monthlyChildcare(ctx, monthIndex, playerStaysHome);
    }
    await this.blackTax.monthly(ctx, monthIndex);
  }

  livingCostMultiplier(ctx: SimulationContext): Promise<number> {
    return this.household.livingCostMultiplier(ctx);
  }

  status(ctx: SimulationContext): Promise<number> {
    return this.household.statusPoints(ctx);
  }

  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    await this.links.reconcile(ctx);
    const state = await this.household.state(ctx);
    return { relationship: { status: state.status, partnerName: state.partnerName }, children: state.childrenCount };
  }
}
