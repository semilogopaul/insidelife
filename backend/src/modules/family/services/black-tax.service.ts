import { Inject, Injectable } from '@nestjs/common';
import {
  BLACK_TAX,
  GENDERS,
  ethnicityOfState,
  formatNaira,
  generateName,
  yearsBetween,
  type BlackTaxReason,
} from '@insidelife/shared';
import { EMPLOYMENT_PORT, type EmploymentPort } from '../../../common/ports/employment.port.js';
import type { LifeEventOutcome, LifeEventParams } from '../../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import type { RelationshipEntity } from '../entities/relationship.entity.js';
import { addMood, adjustStatus, fill } from '../family.util.js';
import { familyTitle, identityOf, relationshipsOfKind, type FamilyGraph } from '../interfaces/family-graph.js';
import { blackTaxAmount, blackTaxChance, pickBlackTaxReason } from '../rules/black-tax.rules.js';
import { FamilyTriggersService } from './family-triggers.service.js';
import { RelationshipsService } from './relationships.service.js';

export const BLACK_TAX_EVENT = 'family-black-tax';
export type BlackTaxChoice = 'pay-all' | 'pay-part' | 'pray';

/** Youngest a character gets asked for money. */
const MIN_AGE = 16;

/**
 * Black tax: the family's monthly requests, more frequent for Sapa families and scaled to what you visibly earn.
 * Requests are queued as triggers and dealt as life-event cards (pay all / pay part / "I'll pray for you").
 */
@Injectable()
export class BlackTaxService {
  constructor(
    @Inject(EMPLOYMENT_PORT) private readonly employment: EmploymentPort,
    private readonly relationships: RelationshipsService,
    private readonly triggers: FamilyTriggersService,
  ) {}

  async monthly(ctx: SimulationContext, monthIndex: number): Promise<void> {
    if (ctx.age < MIN_AGE) return;
    const income = await this.employment.monthlyIncome(ctx);
    const cash = ctx.wallet.cash;
    const rng = ctx.rng('black-tax', monthIndex);
    if (!rng.chance(blackTaxChance({ background: ctx.character.background, monthlyIncome: income, cash, age: ctx.age }))) return;

    const graph = await this.relationships.graph(ctx);
    const alive = (rel: RelationshipEntity): boolean => identityOf(graph, rel).alive;
    const mother = relationshipsOfKind(graph, 'mother').find(alive);
    const father = relationshipsOfKind(graph, 'father').find(alive);
    const siblings = relationshipsOfKind(graph, 'sibling').filter(alive);
    const youngSibling = siblings.find((rel) => yearsBetween(identityOf(graph, rel).bornAt, ctx.time) < 21);
    const reason = pickBlackTaxReason(rng, { mother: !!mother, father: !!father, youngSibling: !!youngSibling });

    const ethnicity = ethnicityOfState(ctx.character.stateOfOrigin);
    const relative = generateName(rng, ethnicity, reason === 'uncle-business' ? 'male' : rng.pick(GENDERS)).firstName;
    const aunty = `Aunty ${generateName(rng, ethnicity, 'female').firstName}`;
    const label = (rel: RelationshipEntity | undefined): string => (rel ? familyTitle(rel.kind, identityOf(graph, rel)) : aunty);

    let requester: string;
    let target: RelationshipEntity | undefined;
    switch (reason) {
      case 'mama-hospital':
        requester = label(father ?? siblings[0]);
        target = mother;
        break;
      case 'cousin-school-fees':
        target = mother ?? father;
        requester = label(target);
        break;
      case 'uncle-business':
        requester = `Uncle ${relative}`;
        target = father ?? mother;
        break;
      case 'rent-help':
        target = father;
        requester = label(target);
        break;
      case 'sibling-jamb':
        target = youngSibling;
        requester = label(target);
        break;
      case 'village-levy':
        requester = 'The town union secretary';
        target = father ?? mother;
        break;
    }

    const amount = blackTaxAmount(reason, income, cash, ctx.world.economy(ctx.time).priceIndex);
    await this.triggers.enqueue(ctx, BLACK_TAX_EVENT, `black-tax:${monthIndex}`, {
      reason,
      amount,
      partAmount: Math.max(5_000, Math.round(amount / 2 / 1_000) * 1_000),
      requester,
      relative: reason === 'sibling-jamb' && youngSibling ? identityOf(graph, youngSibling).firstName : relative,
      targetId: target?.id ?? '',
    });
  }

  title(params: LifeEventParams): string {
    return fill(BLACK_TAX[reasonOf(params)].title, this.values(params));
  }

  body(params: LifeEventParams): string {
    return fill(BLACK_TAX[reasonOf(params)].body, this.values(params));
  }

  art(params: LifeEventParams): string {
    return BLACK_TAX[reasonOf(params)].art;
  }

  async resolve(ctx: SimulationContext, params: LifeEventParams, choice: BlackTaxChoice): Promise<LifeEventOutcome> {
    const amount = Number(params.amount);
    const part = Number(params.partAmount);
    const reason = reasonOf(params);
    const key = `black-tax:${String(params.triggerId ?? params.reason)}:${choice}`;
    const memo = `Family support: ${this.title(params)}`;
    switch (choice) {
      case 'pay-all':
        await ctx.wallet.pay(amount, 'family-support', memo, key);
        await this.adjust(ctx, params, 8);
        adjustStatus(ctx, 4);
        addMood(ctx, 'family-hero', 'Family hero', 3, 3);
        return {
          title: 'You saved the day',
          body: reason === 'uncle-business' ? 'Uncle promises to pay back “by December”. Which December, he did not say.' : 'Prayers are flowing in the family WhatsApp group. Your name is sweet in their mouth.',
          tone: 'good',
          moneyDelta: -amount,
        };
      case 'pay-part':
        await ctx.wallet.pay(part, 'family-support', memo, key);
        await this.adjust(ctx, params, 2);
        adjustStatus(ctx, 1);
        return { title: 'Something is better than nothing', body: `You sent ${formatNaira(part)}. “God will provide the balance.”`, tone: 'neutral', moneyDelta: -part };
      case 'pray':
        await this.adjust(ctx, params, -8);
        adjustStatus(ctx, -3);
        addMood(ctx, 'black-tax-guilt', 'Family guilt', -2, 2);
        return { title: '“I’ll pray for you”', body: 'They are now discussing you in the family WhatsApp group. Someone used the word “stingy”.', tone: 'bad', moneyDelta: 0 };
    }
  }

  /** The request went unanswered for weeks. */
  async ignored(ctx: SimulationContext, params: LifeEventParams): Promise<void> {
    await this.adjust(ctx, params, -4);
  }

  private async adjust(ctx: SimulationContext, params: LifeEventParams, delta: number): Promise<void> {
    const graph: FamilyGraph = await this.relationships.graph(ctx);
    const rel = typeof params.targetId === 'string' && params.targetId ? graph.relationships.find((candidate) => candidate.id === params.targetId) : undefined;
    if (!rel) return;
    this.relationships.touch(graph, rel, ctx.time, { closeness: delta });
    await this.relationships.save(ctx, rel);
  }

  private values(params: LifeEventParams): Record<string, string> {
    return {
      requester: String(params.requester ?? 'The family'),
      relative: String(params.relative ?? ''),
      amount: formatNaira(Number(params.amount ?? 0)),
    };
  }
}

function reasonOf(params: LifeEventParams): BlackTaxReason {
  const reason = String(params.reason);
  return reason in BLACK_TAX ? (reason as BlackTaxReason) : 'village-levy';
}
