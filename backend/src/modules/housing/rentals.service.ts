import { Injectable } from '@nestjs/common';
import {
  CITIES,
  DISTRICTS,
  HOUSING_TYPES,
  HOUSING_TYPE_IDS,
  MINUTES_PER_YEAR,
  QUIT_NOTICE_DAYS,
  RENT_GRACE_DAYS,
  districtComfortBonus,
  findListing,
  formatDate,
  formatNaira,
  generateListings,
  renewalAmount,
  rentQuote,
  weekEndsAt,
  weekIndexOf,
  type RentalListing,
  type RentalListingDto,
  type RentalListingsQuery,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { LeaseEntity, type LeaseEndReason, type LeaseFlags } from './entities/lease.entity.js';
import { HomeService } from './home.service.js';
import {
  RENEWAL_NOTICE_DAYS,
  TWO_YEARS_DEMAND_CHANCE,
  cautionRefund,
  days,
  increasedRent,
  rollRentIncrease,
} from './housing.rules.js';
import { HousingStore } from './housing.store.js';

/** Most listings returned at once (cheapest first) — filter by district or type to see more. */
const MAX_LISTINGS = 120;
/** Landlords only ask for two years upfront on leases at least this big. */
const TWO_YEARS_MIN_RENT = 500_000;

export type SignOutcome =
  | { readonly kind: 'signed'; readonly lease: LeaseEntity; readonly paid: number }
  | { readonly kind: 'scammed'; readonly listing: RentalListing };

/**
 * The rental market: this week's listings, signing a lease (Lagos-style upfront), and the yearly renewal drama —
 * increases, two-years-upfront demands, 14 days' grace, quit notice and eviction back to the family house.
 */
@Injectable()
export class RentalsService {
  constructor(
    private readonly store: HousingStore,
    private readonly homes: HomeService,
  ) {}

  listings(ctx: SimulationContext, query: RentalListingsQuery): RentalListingDto[] {
    const week = weekIndexOf(ctx.time);
    // One city at a time: the one asked for, else the one you are in.
    const districts = query.districtId ? [query.districtId] : CITIES[query.cityId ?? ctx.character.cityId].districtIds;
    const types = query.type ? [query.type] : HOUSING_TYPE_IDS;
    const results: RentalListingDto[] = [];
    for (const districtId of districts) {
      for (const typeId of types) {
        for (const listing of generateListings(ctx.world.seed, districtId, typeId, week)) {
          if (query.maxRent !== undefined && listing.annualRent > query.maxRent) continue;
          results.push(this.toListingDto(ctx, listing));
        }
      }
    }
    return results.toSorted((a, b) => a.annualRent - b.annualRent || a.id.localeCompare(b.id)).slice(0, MAX_LISTINGS);
  }

  /**
   * Pay for a listing. Returns the signed (not yet moved-into) lease, or the bad news that the "agent" was a scammer.
   * The caller moves the household in.
   */
  async sign(ctx: SimulationContext, listingId: string): Promise<SignOutcome> {
    const listing = findListing(ctx.world.seed, listingId);
    if (!listing) throw new ResourceNotFoundException('Listing');
    if (listing.weekIndex !== weekIndexOf(ctx.time)) {
      throw new GameRuleException('LISTING_GONE', 'Omo, that place don go — somebody paid before you. Check this week’s listings.');
    }
    if (DISTRICTS[listing.districtId].cityId !== ctx.character.cityId) {
      throw new GameRuleException('OTHER_CITY', `That place is in ${DISTRICTS[listing.districtId].name}, in another city. Fly or take the bus there first, then sign.`);
    }
    const current = await this.store.lease(ctx);
    if (current && current.listingId === listing.id) throw new GameRuleException('ALREADY_RENTED', 'You already live there — enjoy am!');

    if (listing.scamRisk > 0 && ctx.rng('agent-scam', listing.id).chance(listing.scamRisk)) {
      await this.fallForScam(ctx, listing);
      return { kind: 'scammed', listing };
    }

    const quote = rentQuote(listing);
    if (!ctx.wallet.canAfford(quote.total)) {
      const extras = quote.serviceCharge > 0 ? 'agency, legal, caution, service charge and inspection' : 'agency, legal, caution and inspection';
      throw new GameRuleException(
        'INSUFFICIENT_FUNDS',
        `The landlord wants ${formatNaira(quote.total)} upfront — a year’s rent plus ${extras}. You have ${formatNaira(ctx.wallet.cash)}. Try a cheaper area or a smaller place.`,
      );
    }

    const key = `lease:${listing.id}:${ctx.time}`;
    const place = listing.label;
    await ctx.wallet.pay(quote.inspectionFee, 'fee', `Inspection fee — ${place}`, `${key}:inspection`, { sink: 'fees' });
    await ctx.wallet.pay(quote.rent, 'rent', `Rent (1 year) — ${place}`, `${key}:rent`);
    await ctx.wallet.pay(quote.agency, 'fee', `Agency fee (10%) — ${place}`, `${key}:agency`, { sink: 'fees' });
    await ctx.wallet.pay(quote.legal, 'fee', `Legal fee (10%) — ${place}`, `${key}:legal`, { sink: 'fees' });
    await ctx.wallet.pay(quote.caution, 'rent', `Caution deposit (refundable) — ${place}`, `${key}:caution`);
    await ctx.wallet.pay(quote.serviceCharge, 'rent', `Service charge (1 year) — ${place}`, `${key}:service-charge`);

    const lease = await ctx.manager.save(
      ctx.manager.create(LeaseEntity, {
        characterId: ctx.character.id,
        listingId: listing.id,
        districtId: listing.districtId,
        typeId: listing.typeId,
        label: listing.label,
        features: [...listing.features],
        annualRent: listing.annualRent,
        serviceCharge: listing.serviceCharge,
        cautionDeposit: quote.caution,
        startAt: ctx.time,
        endAt: ctx.time + MINUTES_PER_YEAR,
        status: 'active',
        pendingIncrease: 0,
        renewalDecidedFor: null,
        renewalYears: 1,
        nonRenewing: false,
        nonRenewingReason: null,
        graceUntil: null,
        evictAt: null,
        flags: {},
        endedAt: null,
        endReason: null,
      }),
    );
    return { kind: 'signed', lease, paid: quote.total };
  }

  /** A lease by id (from the memo when it's the open one). */
  async leaseById(ctx: SimulationContext, leaseId: string): Promise<LeaseEntity | null> {
    const open = await this.store.lease(ctx);
    if (open && open.id === leaseId) return open;
    return ctx.manager.findOne(LeaseEntity, { where: { id: leaseId, characterId: ctx.character.id } });
  }

  /** The open lease if it matches `leaseId` and is still running (for life-event cards). */
  async openLease(ctx: SimulationContext, leaseId: string): Promise<LeaseEntity | null> {
    const lease = await this.store.lease(ctx);
    return lease && lease.id === leaseId && lease.status === 'active' ? lease : null;
  }

  /** End a tenancy. The caution deposit comes back minus whatever "damages" the landlord finds. */
  async endLease(ctx: SimulationContext, lease: LeaseEntity, reason: LeaseEndReason, refundCaution: boolean): Promise<void> {
    lease.status = reason === 'evicted' ? 'evicted' : 'ended';
    lease.endedAt = ctx.time;
    lease.endReason = reason;
    await this.store.save(ctx, lease);
    if (!refundCaution || lease.cautionDeposit <= 0) return;

    const { refund, deducted } = cautionRefund(lease.cautionDeposit, ctx.rng('caution-refund', lease.id));
    await ctx.wallet.receive(refund, 'refund', `Caution deposit refund — ${lease.label}`, `caution:${lease.id}`, { income: 'neutral' });
    ctx.notify({
      kind: 'property',
      title: 'Caution deposit refunded',
      body:
        deducted > 0
          ? `Your landlord kept ${formatNaira(deducted)} for “repainting and damages” and returned ${formatNaira(refund)}.`
          : `Your landlord returned the full ${formatNaira(refund)}. A rare and beautiful thing.`,
      tone: deducted > 0 ? 'neutral' : 'good',
      amount: refund,
    });
  }

  /** Daily tenancy lifecycle for the open lease. */
  async onDayEnd(ctx: SimulationContext): Promise<void> {
    const lease = await this.store.lease(ctx);
    if (!lease) return;
    if (lease.status === 'active') {
      const decided = lease.renewalDecidedFor === lease.endAt;
      if (!decided && !lease.nonRenewing && lease.endAt - ctx.time <= days(RENEWAL_NOTICE_DAYS)) await this.decideRenewal(ctx, lease);
      if (ctx.time >= lease.endAt) await this.renewOrMoveOut(ctx, lease);
      return;
    }
    await this.chaseArrears(ctx, lease);
  }

  /** The character died: hand the flat back and refund the caution deposit to the estate. */
  async onDeath(ctx: SimulationContext): Promise<void> {
    const lease = await this.store.lease(ctx);
    if (!lease) return;
    await this.endLease(ctx, lease, 'deceased', true);
    await this.store.setLease(ctx, null);
  }

  // ----- Life-event levers ------------------------------------------------------------------------------------------

  async setFlags(ctx: SimulationContext, lease: LeaseEntity, flags: LeaseFlags): Promise<void> {
    lease.flags = { ...lease.flags, ...flags };
    await this.store.save(ctx, lease);
  }

  /** The landlord was persuaded to halve the increase. */
  async halveIncrease(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    lease.pendingIncrease = Math.round((lease.pendingIncrease / 2) * 100) / 100;
    await this.store.save(ctx, lease);
  }

  /** Someone decided this tenancy ends at `endAt`. */
  async giveNotice(ctx: SimulationContext, lease: LeaseEntity, by: 'tenant' | 'landlord'): Promise<void> {
    lease.nonRenewing = true;
    lease.nonRenewingReason = by;
    await this.store.save(ctx, lease);
  }

  /** Agree to pay two years at renewal; the landlord promises no increase in return. */
  async agreeTwoYears(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    lease.renewalYears = 2;
    lease.pendingIncrease = 0;
    lease.flags = { ...lease.flags, twoYearsDemand: false };
    await this.store.save(ctx, lease);
  }

  async dropTwoYearsDemand(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    lease.flags = { ...lease.flags, twoYearsDemand: false };
    await this.store.save(ctx, lease);
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private toListingDto(ctx: SimulationContext, listing: RentalListing): RentalListingDto {
    const type = HOUSING_TYPES[listing.typeId];
    const district = DISTRICTS[listing.districtId];
    const upfront = rentQuote(listing);
    return {
      id: listing.id,
      districtId: listing.districtId,
      districtName: district.name,
      type: listing.typeId,
      typeLabel: type.label,
      label: listing.label,
      street: listing.street,
      bedrooms: type.bedrooms,
      comfort: type.comfort + districtComfortBonus(listing.districtId),
      gridHours: district.gridHours,
      floodRisk: district.floodRisk,
      features: listing.features,
      annualRent: listing.annualRent,
      marketRent: listing.marketRent,
      upfront,
      affordable: ctx.wallet.canAfford(upfront.total),
      availableUntil: weekEndsAt(listing.weekIndex),
    };
  }

  private async fallForScam(ctx: SimulationContext, listing: RentalListing): Promise<void> {
    const burned = await ctx.manager.exists(LeaseEntity, {
      where: { characterId: ctx.character.id, listingId: listing.id, status: 'scammed' },
    });
    if (burned) {
      throw new GameRuleException('AGENT_GONE', 'That agent’s number has been switched off since. Forget am — find another place.');
    }
    if (!ctx.wallet.canAfford(listing.inspectionFee)) {
      throw new GameRuleException('INSUFFICIENT_FUNDS', `The agent wants ${formatNaira(listing.inspectionFee)} inspection fee before showing you the place.`);
    }
    await ctx.wallet.pay(listing.inspectionFee, 'fee', `Inspection fee — ${listing.label}`, `inspection:${listing.id}:${ctx.time}`, { sink: 'fees' });
    await ctx.manager.save(
      ctx.manager.create(LeaseEntity, {
        characterId: ctx.character.id,
        listingId: listing.id,
        districtId: listing.districtId,
        typeId: listing.typeId,
        label: listing.label,
        features: [...listing.features],
        annualRent: listing.annualRent,
        serviceCharge: 0,
        cautionDeposit: 0,
        startAt: ctx.time,
        endAt: ctx.time,
        status: 'scammed',
        pendingIncrease: 0,
        renewalDecidedFor: null,
        renewalYears: 1,
        nonRenewing: false,
        nonRenewingReason: null,
        graceUntil: null,
        evictAt: null,
        flags: {},
        endedAt: ctx.time,
        endReason: null,
      }),
    );
    ctx.notify({
      kind: 'property',
      title: 'The agent don japa!',
      body: `You paid ${formatNaira(listing.inspectionFee)} inspection fee for “${listing.label}”. The real owner has never heard of him.`,
      tone: 'bad',
      amount: -listing.inspectionFee,
    });
  }

  /** ~30 days before the lease ends the landlord decides: same rent, an increase, or "two years upfront". */
  private async decideRenewal(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    const rng = ctx.rng('lease-renewal', lease.id, lease.endAt);
    lease.pendingIncrease = rollRentIncrease(rng);
    const twoYearsDemand = lease.annualRent >= TWO_YEARS_MIN_RENT && rng.chance(TWO_YEARS_DEMAND_CHANCE);
    lease.flags = { twoYearsDemand, increaseRaised: false, twoYearsRaised: false };
    lease.renewalYears = 1;
    lease.renewalDecidedFor = lease.endAt;
    await this.store.save(ctx, lease);

    const next = increasedRent(lease.annualRent, lease.pendingIncrease);
    ctx.notify(
      lease.pendingIncrease > 0
        ? {
            kind: 'property',
            title: 'Letter from your landlord',
            body: `From ${formatDate(lease.endAt)}, rent at ${lease.label} goes up to ${formatNaira(next)} a year (+${Math.round(lease.pendingIncrease * 100)}%). “Na the economy.”`,
            tone: 'bad',
          }
        : {
            kind: 'property',
            title: 'Rent renewal coming up',
            body: `Your rent at ${lease.label} renews on ${formatDate(lease.endAt)} — same ${formatNaira(next)}. Landlord is in a good mood.`,
            tone: 'neutral',
          },
    );
  }

  private async renewOrMoveOut(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    if (lease.nonRenewing) {
      await this.moveOut(ctx, lease, lease.nonRenewingReason === 'landlord' ? 'landlord-notice' : 'tenant-notice');
      return;
    }
    if (lease.renewalDecidedFor !== lease.endAt) await this.decideRenewal(ctx, lease);
    // An unanswered "two years upfront" demand: pay two years if you can, otherwise the landlord grudgingly takes one.
    if (lease.flags.twoYearsDemand) {
      const twoYears = renewalAmount(increasedRent(lease.annualRent, lease.pendingIncrease), lease.serviceCharge, 2);
      lease.renewalYears = ctx.wallet.canAfford(twoYears) ? 2 : 1;
    }
    if (await this.tryRenew(ctx, lease)) return;

    lease.status = 'grace';
    lease.graceUntil = lease.endAt + days(RENT_GRACE_DAYS);
    await this.store.save(ctx, lease);
    ctx.notify({
      kind: 'bill',
      title: 'Rent is due — landlord dey wait',
      body: `You couldn’t renew ${lease.label}. You have ${RENT_GRACE_DAYS} days (till ${formatDate(lease.graceUntil)}) to pay ${formatNaira(this.renewalDue(lease))} before quit notice.`,
      tone: 'bad',
    });
    ctx.report({ label: 'Rent overdue — in grace period', tone: 'bad' });
  }

  private renewalDue(lease: LeaseEntity): number {
    return renewalAmount(increasedRent(lease.annualRent, lease.pendingIncrease), lease.serviceCharge, lease.renewalYears);
  }

  /** Pay the renewal (same idempotency key per term, so retries during grace can never double-charge). */
  private async tryRenew(ctx: SimulationContext, lease: LeaseEntity): Promise<boolean> {
    const newRent = increasedRent(lease.annualRent, lease.pendingIncrease);
    const years = lease.renewalYears;
    const amount = renewalAmount(newRent, lease.serviceCharge, years);
    const paid = await ctx.wallet.tryPay(amount, 'rent', `Rent renewal (${years} yr) — ${lease.label}`, `rent:${lease.id}:${lease.endAt}`);
    if (!paid) return false;

    lease.annualRent = newRent;
    lease.endAt += years * MINUTES_PER_YEAR;
    lease.status = 'active';
    lease.graceUntil = null;
    lease.evictAt = null;
    lease.pendingIncrease = 0;
    lease.renewalYears = 1;
    lease.renewalDecidedFor = null;
    lease.flags = {};
    await this.store.save(ctx, lease);
    ctx.notify({
      kind: 'bill',
      title: 'Rent renewed',
      body: `Paid ${formatNaira(amount)} for ${years} more year${years > 1 ? 's' : ''} at ${lease.label}. Roof over your head till ${formatDate(lease.endAt)}.`,
      tone: 'neutral',
      amount: -amount,
    });
    ctx.report({ label: `Rent renewed — ${lease.label}`, amount: -amount, tone: 'neutral' });
    return true;
  }

  private async chaseArrears(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    if (await this.tryRenew(ctx, lease)) return;
    if (lease.status === 'grace' && lease.graceUntil !== null && ctx.time >= lease.graceUntil) {
      lease.status = 'notice';
      lease.evictAt = ctx.time + days(QUIT_NOTICE_DAYS);
      await this.store.save(ctx, lease);
      ctx.notify({
        kind: 'bill',
        title: 'Quit notice!',
        body: `Your landlord served you quit notice. Pay ${formatNaira(this.renewalDue(lease))} by ${formatDate(lease.evictAt)} or pack your load back to the family house.`,
        tone: 'bad',
      });
      return;
    }
    if (lease.status === 'notice' && lease.evictAt !== null && ctx.time >= lease.evictAt) await this.evict(ctx, lease);
  }

  private async evict(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    // The landlord keeps the caution deposit against the unpaid rent.
    await this.endLease(ctx, lease, 'evicted', false);
    await this.returnToFamily(ctx, lease);
    ctx.notify({
      kind: 'property',
      title: 'Evicted',
      body: `The landlord’s boys put your things outside ${lease.label}. You’ve moved back to the family house. Mummy didn’t say “I told you so”. Out loud.`,
      tone: 'bad',
    });
    ctx.report({ label: 'Evicted — moved back to the family house', tone: 'bad' });
  }

  private async moveOut(ctx: SimulationContext, lease: LeaseEntity, reason: LeaseEndReason): Promise<void> {
    await this.endLease(ctx, lease, reason, true);
    await this.returnToFamily(ctx, lease);
    ctx.notify({
      kind: 'property',
      title: 'Moved out',
      body: `Your lease at ${lease.label} ended and you’ve moved back to the family house. Check Homes for a new place.`,
      tone: 'neutral',
    });
    ctx.report({ label: `Lease ended — ${lease.label}`, tone: 'neutral' });
  }

  private async returnToFamily(ctx: SimulationContext, lease: LeaseEntity): Promise<void> {
    await this.store.setLease(ctx, null);
    const residence = await this.store.residence(ctx);
    if (residence.kind === 'rented' && residence.leaseId === lease.id) await this.homes.relocate(ctx, { kind: 'family' });
  }
}
