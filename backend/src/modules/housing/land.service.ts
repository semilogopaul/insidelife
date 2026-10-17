import { Injectable } from '@nestjs/common';
import {
  DISTRICTS,
  LAND_AREAS,
  LAND_DISTRICT_IDS,
  LAND_TITLES,
  dailyChance,
  formatDate,
  formatNaira,
  landQuote,
  monthIndexOf,
  monthlyLandGrowth,
  weekEndsAt,
  weekIndexOf,
  type BuyLandRequest,
  type CityId,
  type DisputeKind,
  type DistrictId,
  type LandOfferDto,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { BuildingEntity } from './entities/building.entity.js';
import { PropertyEntity } from './entities/property.entity.js';
import { HomeService } from './home.service.js';
import {
  COURT_DAYS,
  DISPUTE_AUTO_RESOLVE_DAYS,
  VALUE_HISTORY_LENGTH,
  buildingValue,
  days,
  landValue,
  legalFeesFor,
  nextTitle,
  omonileDemand,
  propertyValue,
  regularisationFee,
} from './housing.rules.js';
import { HousingStore } from './housing.store.js';

/** Chance LASG never comes back after you ignore a demolition notice. */
const BULLDOZERS_FORGET_CHANCE = 0.15;

/**
 * Land: plots for sale by title type, buying, perfecting titles at Alausa, monthly appreciation, and the risks that
 * come with weak paper — omonile disputes and LASG demolitions (resolved through life-event cards, in court, or by
 * default when ignored).
 */
@Injectable()
export class LandService {
  constructor(
    private readonly store: HousingStore,
    private readonly homes: HomeService,
  ) {}

  offers(ctx: SimulationContext, districtId?: DistrictId, cityId: CityId = ctx.character.cityId): LandOfferDto[] {
    if (districtId) this.assertLandDistrict(districtId);
    const week = weekIndexOf(ctx.time);
    const offers: LandOfferDto[] = [];
    for (const id of districtId ? [districtId] : LAND_DISTRICT_IDS.filter((each) => DISTRICTS[each].cityId === cityId)) {
      const district = DISTRICTS[id];
      for (const title of Object.values(LAND_TITLES)) {
        const quote = landQuote(ctx.world.seed, id, title.id, 1, week);
        if (!quote) continue;
        offers.push({
          districtId: id,
          districtName: district.name,
          title: title.id,
          titleLabel: title.label,
          blurb: title.blurb,
          pricePerPlot: quote.price,
          costsPerPlot: quote.costs,
          totalPerPlot: quote.total,
          disputeRiskPerYear: title.disputePerYear,
          demolitionRiskPerYear: title.demolitionPerYear,
          expectedAppreciation: district.landAppreciation,
          floodRisk: district.floodRisk,
          availableUntil: weekEndsAt(week),
        });
      }
    }
    return offers;
  }

  async buy(ctx: SimulationContext, request: BuyLandRequest): Promise<PropertyEntity> {
    const { districtId, title } = request;
    const plots = request.plots ?? 1;
    this.assertLandDistrict(districtId);
    const district = DISTRICTS[districtId];
    const quote = landQuote(ctx.world.seed, districtId, title, plots, weekIndexOf(ctx.time));
    if (!quote) {
      throw new GameRuleException(
        'TITLE_UNAVAILABLE',
        `Nobody sells ${LAND_TITLES[title].shortLabel} land in ${district.name} — it’s C of O and Governor’s Consent only for that kind of area.`,
      );
    }
    const titleLabel = LAND_TITLES[title].shortLabel;
    if (!ctx.wallet.canAfford(quote.total)) {
      const tip = title === 'survey' ? 'Save up small — land no dey run.' : 'Weaker titles cost less (but attract omonile).';
      throw new GameRuleException(
        'INSUFFICIENT_FUNDS',
        `${plots} plot${plots > 1 ? 's' : ''} in ${district.name} (${titleLabel}) costs ${formatNaira(quote.total)} with agency, legal and survey fees. You have ${formatNaira(ctx.wallet.cash)}. ${tip}`,
      );
    }

    const rng = ctx.rng('land-plot', districtId, ctx.time);
    const area = rng.pick(LAND_AREAS[districtId] ?? [district.name]);
    const plotNo = rng.int(1, 120);
    const label = plots > 1 ? `Plots ${plotNo}-${plotNo + plots - 1}, ${area}` : `Plot ${plotNo}, ${area}`;
    const key = `land:${districtId}:${title}:${ctx.time}`;
    // The key repeats for a second purchase inside the same game minute: refuse it rather than hand out a free plot.
    await ctx.wallet.pay(quote.price, 'property', `Land: ${label}, ${district.name} (${titleLabel})`, key, {
      refuseRepeat: 'You just bought land there — give it a moment',
    });
    await ctx.wallet.pay(quote.costs.total, 'fee', `Agency, legal & survey fees — ${label}`, `${key}:fees`, { sink: 'fees' });

    const property = ctx.manager.create(PropertyEntity, {
      characterId: ctx.character.id,
      districtId,
      label,
      plots,
      title,
      status: 'owned',
      purchasePrice: quote.price,
      costBasis: quote.total,
      marketValue: quote.marketValue,
      lastAppreciatedMonth: monthIndexOf(ctx.time) - 1,
      valueHistory: [{ t: ctx.time, value: quote.price }],
      dispute: null,
      titlePerfection: null,
      arrears: 0,
      acquiredAt: ctx.time,
      disposedAt: null,
    });
    const saved = await this.store.addProperty(ctx, property);
    ctx.notify({
      kind: 'property',
      title: 'Landlord in the making!',
      body: `You now own ${label}, ${district.name} (${titleLabel}). Put a signboard: “THIS LAND IS NOT FOR SALE”.`,
      tone: 'good',
      amount: -quote.total,
    });
    return saved;
  }

  /** Start perfecting the title one step up (fee now, papers after the processing time). */
  async perfectTitle(ctx: SimulationContext, propertyId: string): Promise<PropertyEntity> {
    const property = await this.store.property(ctx, propertyId);
    if (property.status === 'selling') throw new GameRuleException('PROPERTY_LISTED', 'It’s listed for sale — cancel the sale first.');
    if (property.dispute) {
      throw new GameRuleException('DISPUTE_OPEN', 'Settle the wahala on this land first — the Lands Registry won’t touch a disputed plot.');
    }
    if (property.titlePerfection) {
      throw new GameRuleException(
        'PERFECTION_IN_PROGRESS',
        `Your ${LAND_TITLES[property.titlePerfection.to].shortLabel} papers are already processing at Alausa — ready ${formatDate(property.titlePerfection.readyAt)}.`,
      );
    }
    const perfection = LAND_TITLES[property.title].perfection;
    if (!perfection) throw new GameRuleException('TITLE_PERFECT', 'This land already has a C of O. Nothing to perfect — sleep well.');

    const fee = Math.max(100_000, Math.round((property.marketValue * perfection.feeRate) / 10_000) * 10_000);
    const target = LAND_TITLES[perfection.to].shortLabel;
    if (!ctx.wallet.canAfford(fee)) {
      throw new GameRuleException('INSUFFICIENT_FUNDS', `Perfecting to ${target} costs ${formatNaira(fee)} in fees and “processing”. You have ${formatNaira(ctx.wallet.cash)}.`);
    }
    await ctx.wallet.pay(fee, 'fee', `Title perfection to ${target} — ${property.label}`, `title:${property.id}:${perfection.to}`, { sink: 'fees' });
    property.titlePerfection = { to: perfection.to, readyAt: ctx.time + days(perfection.days), fee };
    property.costBasis += fee;
    await this.store.save(ctx, property);
    return property;
  }

  /** Daily: titles that came through, dispute progress, and fresh title incidents. */
  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const portfolio = await this.store.portfolio(ctx);
    for (const property of await this.store.heldProperties(ctx)) {
      await this.completePerfection(ctx, property);
      const building = this.store.buildingOf(portfolio, property.id);
      if (property.dispute) await this.progressDispute(ctx, property, building);
      else await this.rollIncidents(ctx, property, building, dayIndex);
    }
  }

  /** Monthly land market move (district drift ± seeded shock) and a point on the value chart. */
  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const portfolio = await this.store.portfolio(ctx);
    for (const property of await this.store.heldProperties(ctx)) {
      if (property.lastAppreciatedMonth >= monthIndex) continue;
      property.marketValue = Math.round(property.marketValue * monthlyLandGrowth(ctx.world.seed, property.districtId, monthIndex));
      property.lastAppreciatedMonth = monthIndex;
      const value = propertyValue(property, this.store.buildingOf(portfolio, property.id));
      property.valueHistory = [...property.valueHistory, { t: ctx.time, value }].slice(-VALUE_HISTORY_LENGTH);
      await this.store.save(ctx, property);
    }
  }

  // ----- Dispute levers (life-event choices) ------------------------------------------------------------------------

  /** A held property with an open (not yet in court) dispute of this kind. */
  async disputed(ctx: SimulationContext, propertyId: string, kind: DisputeKind): Promise<PropertyEntity | null> {
    const property = (await this.store.heldProperties(ctx)).find((candidate) => candidate.id === propertyId);
    return property?.dispute?.kind === kind && property.dispute.stage === 'open' ? property : null;
  }

  async markRaised(ctx: SimulationContext, property: PropertyEntity): Promise<void> {
    if (!property.dispute) return;
    property.dispute = { ...property.dispute, raised: true };
    await this.store.save(ctx, property);
  }

  /** Pay the omonile and they disappear (until next time). */
  async settle(ctx: SimulationContext, property: PropertyEntity): Promise<number> {
    const dispute = property.dispute;
    if (!dispute) return 0;
    await ctx.wallet.pay(dispute.demand, 'property', `Omonile settlement — ${property.label}`, `settle:${property.id}:${dispute.openedAt}`);
    property.dispute = null;
    property.costBasis += dispute.demand;
    await this.store.save(ctx, property);
    return dispute.demand;
  }

  /** Pay LASG to regularise: the title moves up one step and the red X is painted over. */
  async regularise(ctx: SimulationContext, property: PropertyEntity): Promise<number> {
    const dispute = property.dispute;
    if (!dispute) return 0;
    await ctx.wallet.pay(dispute.demand, 'fee', `Title regularisation — ${property.label}`, `regularise:${property.id}:${dispute.openedAt}`, { sink: 'fees' });
    property.title = nextTitle(property.title);
    property.titlePerfection = null;
    property.dispute = null;
    property.costBasis += dispute.demand;
    await this.store.save(ctx, property);
    return dispute.demand;
  }

  /** Hire a lawyer; judgement comes in 2-4 months. Returns false if the lawyer's fees can't be paid. */
  async goToCourt(ctx: SimulationContext, property: PropertyEntity): Promise<boolean> {
    const dispute = property.dispute;
    if (!dispute || dispute.stage === 'court') return false;
    const paid = await ctx.wallet.tryPay(dispute.legalFees, 'fee', `Lawyer’s fees — ${property.label}`, `court:${property.id}:${dispute.openedAt}`, {
      sink: 'fees',
    });
    if (!paid) return false;
    const courtDays = ctx.rng('court-duration', property.id, dispute.openedAt).int(COURT_DAYS.min, COURT_DAYS.max);
    property.dispute = { ...dispute, stage: 'court', raised: true, courtUntil: ctx.time + days(courtDays) };
    property.costBasis += dispute.legalFees;
    await this.store.save(ctx, property);
    return true;
  }

  /** Walk away from the land. */
  async abandon(ctx: SimulationContext, property: PropertyEntity, reason: string): Promise<void> {
    await this.loseProperty(ctx, property, reason);
  }

  /** Ignore LASG: usually the bulldozers come; sometimes they forget. Returns true if the building was demolished. */
  async ignoreDemolition(ctx: SimulationContext, property: PropertyEntity): Promise<boolean> {
    const dispute = property.dispute;
    if (!dispute) return false;
    if (ctx.rng('bulldozers', property.id, dispute.openedAt).chance(BULLDOZERS_FORGET_CHANCE)) {
      property.dispute = null;
      await this.store.save(ctx, property);
      return false;
    }
    await this.demolish(ctx, property);
    return true;
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private assertLandDistrict(districtId: DistrictId): void {
    if (DISTRICTS[districtId].landPricePerPlot === null) {
      throw new GameRuleException(
        'NO_LAND_HERE',
        `${DISTRICTS[districtId].name} is fully built up — no plots for sale. Try Epe & Ibeju-Lekki, Ajah, Ikorodu or Ojo.`,
      );
    }
  }

  private async completePerfection(ctx: SimulationContext, property: PropertyEntity): Promise<void> {
    const pending = property.titlePerfection;
    if (!pending || ctx.time < pending.readyAt) return;
    property.title = pending.to;
    property.titlePerfection = null;
    await this.store.save(ctx, property);
    ctx.notify({
      kind: 'property',
      title: 'Your papers are out!',
      body: `${property.label} now has ${LAND_TITLES[pending.to].label}. Less wahala, more value.`,
      tone: 'good',
    });
    ctx.report({ label: `Title perfected — ${property.label}`, tone: 'good' });
  }

  private async rollIncidents(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity | null, dayIndex: number): Promise<void> {
    const title = LAND_TITLES[property.title];
    const structure = building !== null && building.status !== 'demolished';
    // Omonile smell fresh cement: "foundation money" demands double while you build.
    const omonileRate = title.disputePerYear * (building?.status === 'under-construction' ? 2 : 1);
    const rng = ctx.rng('title-incident', property.id, dayIndex);
    let kind: DisputeKind | null = null;
    if (rng.chance(dailyChance(omonileRate))) kind = 'omonile';
    else if (structure && rng.chance(dailyChance(title.demolitionPerYear))) kind = 'demolition';
    if (!kind) return;

    const worth = landValue(property);
    const demand = kind === 'omonile' ? omonileDemand(worth, rng) : regularisationFee(property, buildingValue(building));
    property.dispute = { kind, stage: 'open', openedAt: ctx.time, demand, legalFees: legalFeesFor(worth), raised: false, courtUntil: null };
    await this.store.save(ctx, property);
    ctx.notify(
      kind === 'omonile'
        ? {
            kind: 'property',
            title: 'Omonile wahala!',
            body: `Some “family” has mounted ${property.label} saying the land is theirs. Deal with them before they sell it to someone else.`,
            tone: 'bad',
          }
        : {
            kind: 'property',
            title: 'LASG marked your building',
            body: `Building Control painted a red X on your structure at ${property.label}. Your ${title.shortLabel} papers no satisfy them.`,
            tone: 'bad',
          },
    );
    ctx.report({ label: kind === 'omonile' ? `Omonile dispute — ${property.label}` : `Demolition notice — ${property.label}`, tone: 'bad' });
  }

  private async progressDispute(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity | null): Promise<void> {
    const dispute = property.dispute;
    if (!dispute) return;
    if (dispute.stage === 'open') {
      if (ctx.time - dispute.openedAt < days(DISPUTE_AUTO_RESOLVE_DAYS)) return;
      // Nobody answered: your lawyer files automatically if you can pay, otherwise you lose by default.
      if (await this.goToCourt(ctx, property)) {
        ctx.notify({
          kind: 'property',
          title: 'Your lawyer filed in court',
          body: `The ${dispute.kind === 'omonile' ? 'omonile case' : 'demolition notice'} on ${property.label} is now in court.`,
          tone: 'neutral',
          amount: -dispute.legalFees,
        });
        return;
      }
      if (dispute.kind === 'omonile') await this.loseProperty(ctx, property, 'You ignored the omonile and couldn’t afford a lawyer — they sold your land to someone else.');
      else await this.demolish(ctx, property);
      return;
    }
    if (dispute.courtUntil === null || ctx.time < dispute.courtUntil) return;

    const won = ctx.rng('court-judgement', property.id, dispute.openedAt).chance(LAND_TITLES[property.title].courtWinChance);
    if (won) {
      property.dispute = null;
      await this.store.save(ctx, property);
      ctx.notify({ kind: 'property', title: 'Court don rule for you!', body: `Judgement is in: ${property.label} is yours. Case closed.`, tone: 'good' });
      ctx.report({ label: `Won the land case — ${property.label}`, tone: 'good' });
      return;
    }
    if (dispute.kind === 'demolition') {
      await this.demolish(ctx, property, building);
      return;
    }
    // Lost the omonile case: the court orders you to pay the family, or the land goes.
    const paid = await ctx.wallet.tryPay(dispute.demand, 'property', `Court-ordered settlement — ${property.label}`, `settle:${property.id}:${dispute.openedAt}`);
    if (paid) {
      property.dispute = null;
      property.costBasis += dispute.demand;
      await this.store.save(ctx, property);
      ctx.notify({
        kind: 'property',
        title: 'Court ordered a settlement',
        body: `You lost the case but kept ${property.label} by paying the family ${formatNaira(dispute.demand)}.`,
        tone: 'bad',
        amount: -dispute.demand,
      });
      return;
    }
    await this.loseProperty(ctx, property, 'The court ruled for the family and you couldn’t pay the settlement.');
  }

  private async loseProperty(ctx: SimulationContext, property: PropertyEntity, reason: string): Promise<void> {
    const portfolio = await this.store.portfolio(ctx);
    property.status = 'lost';
    property.dispute = null;
    property.titlePerfection = null;
    property.disposedAt = ctx.time;
    await this.store.save(ctx, property);

    const sale = this.store.saleOf(portfolio, property.id);
    if (sale) {
      sale.status = 'cancelled';
      sale.closedAt = ctx.time;
      await this.store.save(ctx, sale);
    }
    const building = this.store.buildingOf(portfolio, property.id);
    if (building) await this.clearBuilding(ctx, building, false);
    ctx.notify({ kind: 'property', title: `You lost ${property.label}`, body: reason, tone: 'bad' });
    ctx.report({ label: `Lost ${property.label}`, tone: 'bad' });
  }

  private async demolish(ctx: SimulationContext, property: PropertyEntity, known?: BuildingEntity | null): Promise<void> {
    const building = known ?? this.store.buildingOf(await this.store.portfolio(ctx), property.id);
    property.dispute = null;
    await this.store.save(ctx, property);
    if (!building || building.status === 'demolished') return;
    await this.clearBuilding(ctx, building, true);
    ctx.notify({
      kind: 'property',
      title: 'The bulldozers came',
      body: `LASG pulled down the building at ${property.label}. The land is still yours — with better papers next time.`,
      tone: 'bad',
    });
    ctx.report({ label: `Building demolished — ${property.label}`, tone: 'bad' });
  }

  /** Tenants out, owner out (back to the family house), structure gone or forfeited. */
  private async clearBuilding(ctx: SimulationContext, building: BuildingEntity, demolished: boolean): Promise<void> {
    const residence = await this.store.residence(ctx);
    const wasHome = residence.kind === 'owned' && residence.buildingId === building.id;
    if (demolished) {
      building.status = 'demolished';
      building.value = 0;
      building.stalledSince = null;
      building.overrun = null;
    }
    building.ownerOccupied = false;
    building.letting = false;
    building.units = [];
    await this.store.save(ctx, building);
    if (wasHome) await this.homes.relocate(ctx, { kind: 'family' });
  }
}
