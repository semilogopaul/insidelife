import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CARE_FACILITY_TYPES,
  FACILITIES,
  MAX_CARRIER_AGE,
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  PREGNANCY_MINUTES,
  RECOMMENDED_ANTENATAL_VISITS,
  dayIndexOf,
  deliveryComplicationChance,
  findVenue,
  formatDate,
  formatNaira,
  nextAntenatalDue,
  pregnancyTrimester,
  type CareFacilityType,
  type DeliveryQuoteDto,
  type PregnancyDto,
} from '@insidelife/shared';
import { FAMILY_PORT, type FamilyPort } from '../../common/ports/family.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { AdmissionsService } from './admissions.service.js';
import { nearestCareVenue } from './care-venues.js';
import { ConditionsService } from './conditions.service.js';
import { PregnancyEntity, type DeliveryMode } from './entities/pregnancy.entity.js';
import { DEFAULT_PARTNER_AGE, HEALTH_MEMO } from './health.constants.js';
import { InsuranceService } from './insurance.service.js';
import { MedicalHistoryService } from './medical-history.service.js';
import { setMoodModifier } from './mood-modifiers.js';

/** Ward days after a delivery (the bill is a package; no nightly charge). */
const DELIVERY_STAY_DAYS: Readonly<Record<DeliveryMode, number>> = { normal: 1, 'c-section': 3 };
const COMPLICATION_EXTRA_DAYS = 2;
/** Health cost of giving birth (recovered over the following weeks by the body's own healing). */
const DELIVERY_HEALTH_COST: Readonly<Record<DeliveryMode, number>> = { normal: 3, 'c-section': 6 };

type HospitalTier = Exclude<CareFacilityType, 'pharmacy'>;

/**
 * Pregnancy and childbirth. `conceive` starts a nine-game-month pregnancy carried by the character (female) or by
 * their partner (male characters — tracked here so reminders, bills and the birth still flow through this character).
 * Antenatal visits lower the complication risk; at the due date the baby is delivered at the planned hospital (or the
 * nearest public one), the bill is paid (HMO maternity cover applies) and the family domain records the birth.
 */
@Injectable()
export class PregnancyService {
  private readonly logger = new Logger(PregnancyService.name);
  private familyPort: FamilyPort | null | undefined;

  constructor(
    private readonly conditions: ConditionsService,
    private readonly insurance: InsuranceService,
    private readonly admissions: AdmissionsService,
    private readonly history: MedicalHistoryService,
    private readonly planner: TimelinePlanner,
    private readonly moduleRef: ModuleRef,
  ) {}

  async current(ctx: SimulationContext): Promise<PregnancyEntity | null> {
    return ctx.memo(HEALTH_MEMO.pregnancy, () =>
      ctx.manager.findOne(PregnancyEntity, { where: { characterId: ctx.character.id, status: 'ongoing' }, order: { conceivedAt: 'DESC' } }),
    );
  }

  /** Start a pregnancy unless one is already ongoing. Returns null when nothing started. */
  async conceive(ctx: SimulationContext, partnerName: string): Promise<PregnancyEntity | null> {
    if (!ctx.character.alive || (await this.current(ctx))) return null;
    const carrier = ctx.character.gender === 'female' ? 'self' : 'partner';
    if (carrier === 'self' && ctx.age > MAX_CARRIER_AGE) {
      this.logger.debug(`Ignoring conception for ${ctx.character.id}: carrier is ${ctx.age}`);
      return null;
    }
    const name = partnerName.trim().slice(0, 80) || 'your partner';
    const home = (await this.planner.place(ctx, ctx.character.locationId)).districtId;
    const planned = nearestCareVenue('hospital-public', ctx.character.homeDistrictId) ?? nearestCareVenue('hospital-public', home);

    const pregnancy = ctx.manager.create(PregnancyEntity, {
      characterId: ctx.character.id,
      carrier,
      partnerName: name,
      conceivedAt: ctx.time,
      dueAt: ctx.time + PREGNANCY_MINUTES,
      antenatalVisits: 0,
      remindersSent: 0,
      riskRoll: ctx.rng('pregnancy-risk', ctx.time).next(),
      highRisk: false,
      plannedFacility: 'hospital-public',
      plannedVenueId: planned?.id ?? null,
      status: 'ongoing',
      deliveredAt: null,
      deliveryMode: null,
      deliveryVenueId: null,
      complications: false,
      conditionRecordId: null,
    });
    if (carrier === 'self') pregnancy.conditionRecordId = (await this.conditions.create(ctx, 'pregnancy', 'mild', 'conception')).id;
    await ctx.manager.save(pregnancy);
    ctx.invalidate(HEALTH_MEMO.pregnancy);

    const due = formatDate(pregnancy.dueAt);
    await this.history.record(ctx, { kind: 'pregnancy', conditionId: 'pregnancy', summary: carrier === 'self' ? `Pregnant — due ${due}` : `${name} is pregnant — due ${due}` });
    ctx.notify(
      carrier === 'self'
        ? { kind: 'health', title: '🤰 You’re pregnant!', body: `Congratulations! The baby is due around ${due}. Book antenatal visits at a hospital and start planning where you’ll deliver.`, tone: 'good' }
        : { kind: 'family', title: `🤰 ${name} is pregnant!`, body: `You’re going to be a father! The baby is due around ${due}. Antenatal visits and the delivery bill are on you — start saving.`, tone: 'good' },
    );
    return pregnancy;
  }

  /** Antenatal visit price at a facility (after HMO maternity cover). */
  async antenatalQuote(ctx: SimulationContext, pregnancy: PregnancyEntity, facility: CareFacilityType): Promise<{ price: number; covered: number; youPay: number; membershipId: string | null }> {
    const base = FACILITIES[facility].antenatalPrice;
    const price = base === null ? 0 : ctx.world.price(base, ctx.time);
    return this.insurance.cover(ctx, facility, price, { maternityConceivedAt: pregnancy.conceivedAt });
  }

  /** An antenatal visit finished: count it, plan the delivery here, and flag risk factors the doctor spots. */
  async completeAntenatal(ctx: SimulationContext, pregnancyId: string, venueId: string, facility: CareFacilityType): Promise<void> {
    const pregnancy = await this.current(ctx);
    if (!pregnancy || pregnancy.id !== pregnancyId || facility === 'pharmacy') return;
    const baseline = this.complicationChance(ctx, pregnancy, 0);
    pregnancy.antenatalVisits += 1;
    pregnancy.plannedFacility = facility;
    pregnancy.plannedVenueId = venueId;
    const spotted = !pregnancy.highRisk && pregnancy.riskRoll < baseline;
    if (spotted) pregnancy.highRisk = true;
    await ctx.manager.save(pregnancy);

    const venueName = findVenue(venueId)?.name ?? 'the hospital';
    const next = nextAntenatalDue(pregnancy.conceivedAt, pregnancy.antenatalVisits);
    const who = pregnancy.carrier === 'self' ? 'Baby' : `${pregnancy.partnerName}’s baby`;
    await this.history.record(ctx, { kind: 'antenatal', conditionId: 'pregnancy', summary: `Antenatal visit ${pregnancy.antenatalVisits} at ${venueName}`, venueId });
    ctx.notify({
      kind: 'health',
      title: 'Antenatal visit done',
      body: spotted
        ? `The doctor at ${venueName} flagged some risk factors and wants to see you regularly. Keep every appointment — it really lowers the risk.`
        : `${who} is growing well. Delivery is now planned at ${venueName}.${next ? ` Next visit around ${formatDate(next)}.` : ' That’s the full schedule — well done.'}`,
      tone: spotted ? 'neutral' : 'good',
    });
  }

  /** Antenatal reminders, the one-month-to-go heads-up, and delivery on the due date. */
  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const pregnancy = await this.current(ctx);
    if (!pregnancy) return;
    if (ctx.time >= pregnancy.dueAt) {
      await this.deliver(ctx, pregnancy);
      return;
    }

    // One reminder per scheduled visit (visits made early count as reminded; overdue ones collapse into one nudge).
    let reminded = Math.max(pregnancy.remindersSent, pregnancy.antenatalVisits);
    const reminderAt = nextAntenatalDue(pregnancy.conceivedAt, reminded);
    if (reminderAt !== null && ctx.time >= reminderAt) {
      while ((nextAntenatalDue(pregnancy.conceivedAt, reminded + 1) ?? Number.POSITIVE_INFINITY) <= ctx.time) reminded++;
      pregnancy.remindersSent = reminded + 1;
      await ctx.manager.save(pregnancy);
      const who = pregnancy.carrier === 'self' ? 'You’re' : `${pregnancy.partnerName} is`;
      const done = pregnancy.antenatalVisits === 0 ? 'none done yet' : `${pregnancy.antenatalVisits} of ${RECOMMENDED_ANTENATAL_VISITS} done`;
      ctx.notify({
        kind: 'health',
        title: 'Antenatal visit due',
        body: `${who} due for an antenatal check (${done}). Every visit lowers the risk at delivery — go to any hospital and choose “Antenatal” in the Health app.`,
        tone: 'neutral',
      });
    }

    if (dayIndex === dayIndexOf(pregnancy.dueAt - MINUTES_PER_MONTH)) {
      const tier = this.deliveryTier(pregnancy);
      const prices = FACILITIES[tier].delivery;
      const venueName = findVenue(pregnancy.plannedVenueId ?? '')?.name ?? 'a public hospital';
      ctx.notify({
        kind: 'health',
        title: 'One month to go!',
        body: `Delivery is planned at ${venueName}${prices ? ` — about ${formatNaira(ctx.world.price(prices.normal, ctx.time))} for a normal delivery, ${formatNaira(ctx.world.price(prices.cSection, ctx.time))} if it’s a C-section` : ''}. Keep that money ready.`,
        tone: 'neutral',
      });
    }
  }

  async deliveryQuotes(ctx: SimulationContext, pregnancy: PregnancyEntity): Promise<DeliveryQuoteDto[]> {
    const quotes: DeliveryQuoteDto[] = [];
    for (const facility of CARE_FACILITY_TYPES) {
      const prices = FACILITIES[facility].delivery;
      if (!prices) continue;
      const normal = ctx.world.price(prices.normal, ctx.time);
      const cSection = ctx.world.price(prices.cSection, ctx.time);
      const options = { maternityConceivedAt: pregnancy.conceivedAt };
      quotes.push({
        facility,
        normal,
        cSection,
        normalYouPay: (await this.insurance.cover(ctx, facility, normal, options)).youPay,
        cSectionYouPay: (await this.insurance.cover(ctx, facility, cSection, options)).youPay,
      });
    }
    return quotes;
  }

  async dto(ctx: SimulationContext, pregnancy: PregnancyEntity): Promise<PregnancyDto> {
    return {
      id: pregnancy.id,
      carrier: pregnancy.carrier,
      partnerName: pregnancy.partnerName,
      conceivedAt: pregnancy.conceivedAt,
      dueAt: pregnancy.dueAt,
      trimester: pregnancyTrimester(pregnancy.conceivedAt, ctx.time),
      antenatalVisits: pregnancy.antenatalVisits,
      recommendedVisits: RECOMMENDED_ANTENATAL_VISITS,
      nextVisitDue: nextAntenatalDue(pregnancy.conceivedAt, pregnancy.antenatalVisits),
      highRisk: pregnancy.highRisk,
      plannedFacility: pregnancy.plannedFacility,
      plannedVenueId: pregnancy.plannedVenueId,
      plannedVenueName: pregnancy.plannedVenueId ? (findVenue(pregnancy.plannedVenueId)?.name ?? null) : null,
      deliveryQuotes: await this.deliveryQuotes(ctx, pregnancy),
    };
  }

  async endOnDeath(ctx: SimulationContext): Promise<void> {
    const pregnancy = await this.current(ctx);
    if (!pregnancy) return;
    pregnancy.status = 'ended';
    await ctx.manager.save(pregnancy);
    ctx.invalidate(HEALTH_MEMO.pregnancy);
  }

  private async deliver(ctx: SimulationContext, pregnancy: PregnancyEntity): Promise<void> {
    const self = pregnancy.carrier === 'self';
    const partnerAge = self ? ctx.age : await this.partnerAge(ctx);
    const complications = pregnancy.riskRoll < this.complicationChance(ctx, pregnancy, pregnancy.antenatalVisits, partnerAge);
    let tier = this.deliveryTier(pregnancy);
    const rng = ctx.rng('delivery', pregnancy.id);
    const mode: DeliveryMode = complications || rng.chance(FACILITIES[tier].delivery?.cSectionRate ?? 0) ? 'c-section' : 'normal';

    // Pay at the planned tier; fall back to a public hospital; never let money stop a baby being born.
    let venueId = pregnancy.plannedFacility === tier ? pregnancy.plannedVenueId : null;
    let paid = await this.payDelivery(ctx, pregnancy, tier, mode);
    if (paid === null && tier !== 'hospital-public') {
      tier = 'hospital-public';
      venueId = null;
      paid = await this.payDelivery(ctx, pregnancy, tier, mode);
    }
    const waived = paid === null;
    venueId ??= nearestCareVenue(tier, ctx.character.homeDistrictId)?.id ?? null;
    const venueName = findVenue(venueId ?? '')?.name ?? 'the hospital';

    pregnancy.status = 'delivered';
    pregnancy.deliveredAt = ctx.time;
    pregnancy.deliveryMode = mode;
    pregnancy.deliveryVenueId = venueId;
    pregnancy.complications = complications;
    await ctx.manager.save(pregnancy);
    ctx.invalidate(HEALTH_MEMO.pregnancy);

    if (self) {
      const condition = pregnancy.conditionRecordId
        ? (await this.conditions.current(ctx)).find((candidate) => candidate.id === pregnancy.conditionRecordId)
        : undefined;
      if (condition) await this.conditions.recover(ctx, condition, 'delivery');
      ctx.character.health = Math.max(1, ctx.character.health - DELIVERY_HEALTH_COST[mode]);
      if (venueId) {
        await this.admissions.admit(ctx, {
          venueId,
          facility: tier,
          days: DELIVERY_STAY_DAYS[mode] + (complications ? COMPLICATION_EXTRA_DAYS : 0),
          reason: mode === 'c-section' ? 'Delivery (C-section)' : 'Delivery',
          pregnancyId: pregnancy.id,
          dailyRate: 0,
        });
      }
    }

    await this.family()?.recordBirth(ctx, pregnancy.partnerName);

    setMoodModifier(ctx, { id: 'new-baby', label: 'New baby joy', value: 15, until: ctx.time + 7 * MINUTES_PER_DAY });
    const how = mode === 'c-section' ? (complications ? 'an emergency C-section' : 'a C-section') : 'a normal delivery';
    const bill = waived
      ? ' The hospital’s social welfare unit and your church family covered the bill.'
      : paid && paid > 0
        ? ` Hospital bill: ${formatNaira(paid)}.`
        : '';
    await this.history.record(ctx, {
      kind: 'birth',
      conditionId: 'pregnancy',
      summary: `${self ? 'Gave birth' : `${pregnancy.partnerName} gave birth`} at ${venueName} (${how})`,
      cost: paid ?? 0,
      venueId,
    });
    ctx.notify({
      kind: 'family',
      title: '🍼 It’s a baby! Congratulations!',
      body: self
        ? `You delivered safely at ${venueName} by ${how}. Mother and baby are doing well — the naming ceremony is loading!${bill}`
        : `${pregnancy.partnerName} delivered safely at ${venueName} by ${how}. You’re a father! Wetin you go name am?${bill}`,
      tone: 'good',
      amount: paid && paid > 0 ? -paid : undefined,
    });
    ctx.report({ label: self ? 'Welcomed a new baby' : `${pregnancy.partnerName} had your baby`, amount: paid && paid > 0 ? -paid : undefined, tone: 'good' });
  }

  /** Pay a delivery bill at a tier; returns what the character paid, or null if they couldn't afford it. */
  private async payDelivery(ctx: SimulationContext, pregnancy: PregnancyEntity, tier: HospitalTier, mode: DeliveryMode): Promise<number | null> {
    const prices = FACILITIES[tier].delivery;
    if (!prices) return null;
    const price = ctx.world.price(mode === 'c-section' ? prices.cSection : prices.normal, ctx.time);
    const quote = await this.insurance.cover(ctx, tier, price, { maternityConceivedAt: pregnancy.conceivedAt });
    const paid = await ctx.wallet.tryPay(quote.youPay, 'health', `Delivery (${mode === 'c-section' ? 'C-section' : 'normal'}) — ${FACILITIES[tier].label}`, `delivery:${pregnancy.id}:${tier}`, {
      metadata: { pregnancyId: pregnancy.id, covered: quote.covered },
    });
    if (!paid) return null;
    await this.insurance.claim(ctx, quote);
    return quote.youPay;
  }

  private deliveryTier(pregnancy: PregnancyEntity): HospitalTier {
    return pregnancy.plannedFacility === 'hospital-private' ? 'hospital-private' : 'hospital-public';
  }

  private complicationChance(ctx: SimulationContext, pregnancy: PregnancyEntity, visits: number, partnerAge = DEFAULT_PARTNER_AGE): number {
    const self = pregnancy.carrier === 'self';
    return deliveryComplicationChance({
      antenatalVisits: visits,
      carrierAge: self ? ctx.age : partnerAge,
      carrierHealth: self ? ctx.character.health : 70,
    });
  }

  private async partnerAge(ctx: SimulationContext): Promise<number> {
    const family = this.family();
    if (!family) return DEFAULT_PARTNER_AGE;
    return (await family.snapshot(ctx)).partner?.age ?? DEFAULT_PARTNER_AGE;
  }

  /**
   * The family domain sits above health in the dependency order (and imports HealthModule for `conceive`), so the
   * family port is resolved lazily from the container instead of importing FamilyModule (which would be circular).
   */
  private family(): FamilyPort | null {
    if (this.familyPort === undefined) {
      try {
        this.familyPort = this.moduleRef.get<FamilyPort>(FAMILY_PORT, { strict: false });
      } catch {
        this.logger.warn('FAMILY_PORT is not registered; births will not be recorded in the family tree');
        this.familyPort = null;
      }
    }
    return this.familyPort;
  }
}
