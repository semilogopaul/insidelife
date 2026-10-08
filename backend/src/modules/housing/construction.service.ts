import { Injectable } from '@nestjs/common';
import {
  BLUEPRINTS,
  DAYS_PER_MONTH,
  OVERRUN_CHANCE,
  PLOT_SQM,
  UPFRONT_BUILD_DISCOUNT,
  formatNaira,
  type BlueprintId,
  type ConstructionPaymentPlan,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BuildingEntity } from './entities/building.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';
import { COMPLETION_PREMIUM, OVERRUN_AUTO_RESOLVE_DAYS, days, nextMilestoneAmount, overrunAmount } from './housing.rules.js';
import { HousingStore } from './housing.store.js';

/** Quality hit when you tell the contractor to "manage" with cheaper materials. */
const CHEAP_MATERIALS_CONDITION_HIT = 15;
const MIN_CONDITION = 40;
/** Delay when you sack the contractor and find another. */
const NEW_CONTRACTOR_DELAY_DAYS = 30;

/**
 * Building on your land: pay upfront (5% off) or in monthly milestones, watch progress day by day, survive the
 * contractor's "cement don go up" overruns, and collect the keys.
 */
@Injectable()
export class ConstructionService {
  constructor(private readonly store: HousingStore) {}

  async start(ctx: SimulationContext, propertyId: string, blueprintId: BlueprintId, plan: ConstructionPaymentPlan): Promise<BuildingEntity> {
    const property = await this.store.property(ctx, propertyId);
    const portfolio = await this.store.portfolio(ctx);
    if (property.status === 'selling') throw new GameRuleException('PROPERTY_LISTED', 'It’s listed for sale — cancel the sale before you build.');
    if (property.dispute) throw new GameRuleException('DISPUTE_OPEN', 'You can’t build on land with wahala — settle the dispute first.');
    const existing = this.store.buildingOf(portfolio, property.id);
    if (existing && existing.status !== 'demolished') {
      throw new GameRuleException(
        'ALREADY_BUILT',
        existing.status === 'complete' ? 'There’s already a house on this land.' : 'Construction is already going on here — one project at a time.',
      );
    }

    const blueprint = BLUEPRINTS[blueprintId];
    const sizeSqm = property.plots * PLOT_SQM;
    if (sizeSqm < blueprint.minSqm) {
      const plotsNeeded = Math.ceil(blueprint.minSqm / PLOT_SQM);
      throw new GameRuleException(
        'PLOT_TOO_SMALL',
        `A ${blueprint.label.toLowerCase()} needs at least ${blueprint.minSqm.toLocaleString('en-NG')} sqm (${plotsNeeded} plots). This land is ${sizeSqm.toLocaleString('en-NG')} sqm.`,
      );
    }

    const contractSum = ctx.world.price(blueprint.baseCost, ctx.time);
    const upfront = plan === 'upfront';
    const budget = upfront ? Math.round(contractSum * (1 - UPFRONT_BUILD_DISCOUNT)) : contractSum;
    const firstPayment = upfront ? budget : Math.ceil(budget / blueprint.months);
    if (!ctx.wallet.canAfford(firstPayment)) {
      throw new GameRuleException(
        'INSUFFICIENT_FUNDS',
        upfront
          ? `Building a ${blueprint.label.toLowerCase()} costs ${formatNaira(budget)} upfront. You have ${formatNaira(ctx.wallet.cash)} — try paying in monthly milestones.`
          : `The contractor needs ${formatNaira(firstPayment)} to mobilise to site (first of ${blueprint.months} monthly payments). You have ${formatNaira(ctx.wallet.cash)}.`,
      );
    }

    const building = await this.store.addBuilding(
      ctx,
      ctx.manager.create(BuildingEntity, {
        propertyId: property.id,
        characterId: ctx.character.id,
        blueprintId,
        status: 'under-construction',
        paymentPlan: plan,
        budget,
        costPaid: 0,
        progressDays: 0,
        durationDays: blueprint.months * DAYS_PER_MONTH,
        milestonesPaid: 0,
        milestones: blueprint.months,
        startedAt: ctx.time,
        completedAt: null,
        stalledSince: null,
        overrun: null,
        value: 0,
        condition: 100,
        ownerOccupied: false,
        letting: false,
        units: [],
      }),
    );
    const memo = upfront ? `Construction (paid upfront) — ${blueprint.label}, ${property.label}` : `Construction mobilisation 1/${blueprint.months} — ${blueprint.label}, ${property.label}`;
    await ctx.wallet.pay(firstPayment, 'property', memo, `build:${building.id}:m0`);
    building.costPaid = firstPayment;
    building.milestonesPaid = upfront ? blueprint.months : 1;
    await this.store.save(ctx, building);
    property.costBasis += firstPayment;
    await this.store.save(ctx, property);
    return building;
  }

  /** Daily site progress: milestone payments, stalls, overruns and completion. */
  async onDayEnd(ctx: SimulationContext): Promise<void> {
    const portfolio = await this.store.portfolio(ctx);
    for (const property of await this.store.heldProperties(ctx)) {
      const building = this.store.buildingOf(portfolio, property.id);
      if (building?.status === 'under-construction') await this.workDay(ctx, property, building);
    }
  }

  /** The building under construction with a pending overrun (for the life-event card). */
  async withOverrun(ctx: SimulationContext, buildingId: string): Promise<{ property: PropertyEntity; building: BuildingEntity } | null> {
    const portfolio = await this.store.portfolio(ctx);
    const building = portfolio.buildings.find((candidate) => candidate.id === buildingId);
    const property = building ? portfolio.properties.find((candidate) => candidate.id === building.propertyId) : undefined;
    if (!building || !property || building.status !== 'under-construction' || !building.overrun) return null;
    return { property, building };
  }

  async markOverrunRaised(ctx: SimulationContext, building: BuildingEntity): Promise<void> {
    if (!building.overrun) return;
    building.overrun = { ...building.overrun, raised: true };
    await this.store.save(ctx, building);
  }

  /** Pay the contractor's extra demand. */
  async payOverrun(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity): Promise<number> {
    const overrun = building.overrun;
    if (!overrun) return 0;
    await ctx.wallet.pay(overrun.amount, 'property', `Construction overrun — ${property.label}`, `build:${building.id}:overrun:${overrun.milestone}`);
    building.budget += overrun.amount;
    building.costPaid += overrun.amount;
    building.overrun = null;
    await this.store.save(ctx, building);
    property.costBasis += overrun.amount;
    await this.store.save(ctx, property);
    return overrun.amount;
  }

  /** "Manage am": no extra money, weaker house. */
  async useCheaperMaterials(ctx: SimulationContext, building: BuildingEntity): Promise<void> {
    building.condition = Math.max(MIN_CONDITION, building.condition - CHEAP_MATERIALS_CONDITION_HIT);
    building.overrun = null;
    await this.store.save(ctx, building);
  }

  /** Sack the contractor: no extra money, a month's delay finding another. */
  async changeContractor(ctx: SimulationContext, building: BuildingEntity): Promise<void> {
    building.durationDays += NEW_CONTRACTOR_DELAY_DAYS;
    building.overrun = null;
    await this.store.save(ctx, building);
  }

  private async workDay(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity): Promise<void> {
    if (building.overrun && ctx.time - building.overrun.since >= days(OVERRUN_AUTO_RESOLVE_DAYS)) {
      await this.useCheaperMaterials(ctx, building);
      ctx.notify({
        kind: 'property',
        title: 'Contractor “managed” the materials',
        body: `You never answered about the extra money, so the contractor used cheaper materials on ${property.label}. Pray for the roof.`,
        tone: 'bad',
      });
    }

    if (!(await this.payDueMilestone(ctx, property, building))) return;

    building.progressDays += 1;
    const crossedMonth = building.progressDays % DAYS_PER_MONTH === 0;
    if (crossedMonth && building.progressDays < building.durationDays && !building.overrun) this.rollOverrun(ctx, property, building);
    if (building.progressDays >= building.durationDays && building.costPaid >= building.budget && !building.overrun) {
      this.complete(ctx, property, building);
    }
    await this.store.save(ctx, building);
  }

  /** Returns false when work is stalled waiting for money. */
  private async payDueMilestone(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity): Promise<boolean> {
    const due =
      building.paymentPlan === 'milestones' &&
      building.milestonesPaid < building.milestones &&
      building.progressDays >= building.milestonesPaid * DAYS_PER_MONTH;
    if (!due) return true;

    const amount = nextMilestoneAmount(building);
    const label = `Construction milestone ${building.milestonesPaid + 1}/${building.milestones} — ${property.label}`;
    const paid = await ctx.wallet.tryPay(amount, 'property', label, `build:${building.id}:m${building.milestonesPaid}`);
    if (!paid) {
      if (building.stalledSince === null) {
        building.stalledSince = ctx.time;
        await this.store.save(ctx, building);
        ctx.notify({
          kind: 'property',
          title: 'Contractor don stop work',
          body: `Site at ${property.label} is idle — the next milestone (${formatNaira(amount)}) wasn’t paid. Work resumes once your account can carry it.`,
          tone: 'bad',
        });
        ctx.report({ label: `Construction stalled — ${property.label}`, tone: 'bad' });
      }
      return false;
    }
    building.costPaid += amount;
    building.milestonesPaid += 1;
    building.stalledSince = null;
    property.costBasis += amount;
    await this.store.save(ctx, property);
    ctx.report({ label: `Construction milestone paid — ${property.label}`, amount: -amount, tone: 'neutral' });
    return true;
  }

  private rollOverrun(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity): void {
    const milestone = Math.floor(building.progressDays / DAYS_PER_MONTH);
    const rng = ctx.rng('construction-overrun', building.id, milestone);
    if (!rng.chance(OVERRUN_CHANCE)) return;
    const amount = overrunAmount(building.budget, rng);
    building.overrun = { amount, since: ctx.time, milestone, raised: false };
    ctx.notify({
      kind: 'property',
      title: 'Cement don go up',
      body: `Your contractor at ${property.label} needs ${formatNaira(amount)} extra. Decide before he decides for you.`,
      tone: 'bad',
    });
  }

  private complete(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity): void {
    const blueprint = BLUEPRINTS[building.blueprintId];
    building.status = 'complete';
    building.completedAt = ctx.time;
    building.value = Math.round(building.costPaid * (1 + COMPLETION_PREMIUM));
    building.stalledSince = null;
    building.units = [];
    ctx.notify({
      kind: 'property',
      title: 'Your house don complete!',
      body: `The ${blueprint.label.toLowerCase()} at ${property.label} is ready. Move in, or let it out and collect rent like a proper landlord.`,
      tone: 'good',
    });
    ctx.report({ label: `Construction complete — ${blueprint.label}, ${property.label}`, tone: 'good' });
  }
}
