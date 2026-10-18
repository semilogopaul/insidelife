import { Injectable } from '@nestjs/common';
import {
  DISTRICTS,
  HOTELS,
  HOTEL_MAX_NIGHTS,
  HOTEL_TIER_INFO,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  cityOfDistrict,
  findHotel,
  findVenue,
  getCity,
  formatClock12,
  hasHomeInCity,
  hotelsInCity,
  hotelVenue,
  startOfDay,
  stayCheckoutAt,
  type CityId,
  type HotelBookingResultDto,
  type HotelCheckoutResultDto,
  type HotelDefinition,
  type HotelOfferDto,
  type HotelStayDto,
  type HotelsDto,
  type StaySummaryDto,
} from '@insidelife/shared';
import { GameRuleException, InsufficientFundsException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HotelStayEntity } from './entities/hotel-stay.entity.js';

const STAY_MEMO = 'hotel-stay';
/** Most characters never book a room: the read is skipped when they have no row (see `RowProbe`). */
export const STAY_ROWS: RowProbe = { key: 'hotels:stays', table: 'hotel_stays', where: "character_id = $1 AND status = 'active'" };
/** A stay may run this many nights in all, extensions included. */
const MAX_STAY_NIGHTS = 30;
/** The hour after which a traveller with nowhere to sleep is pointed to a hotel (once a night). */
export const NO_HOME_NOTE_HOUR = 21;

/**
 * Hotel rooms: book a night or several at the reception of the hotel you are standing in (price by tier, through the
 * ledger), extend, check out. A stay is a temporary home until checkout: the autopilot beds you down in the room
 * (`HotelsSystem.residence`), sleeping there is real sleep, and the bar, restaurant, pool and gym are the hotel's actions.
 */
@Injectable()
export class HotelsService {
  // ----- Reads -----------------------------------------------------------------------------------------------------

  /** The character's active stay, or null. A stay whose checkout time has passed is ended by `endDue`. */
  async activeStay(ctx: SimulationContext): Promise<HotelStayEntity | null> {
    return ctx.memo(STAY_MEMO, async () => {
      if (!(await ctx.mayHaveRows(STAY_ROWS))) return null;
      return ctx.manager.findOne(HotelStayEntity, { where: { characterId: ctx.character.id, status: 'active' } });
    });
  }

  /** The stay in the room at game minute `t` (it has started and not yet checked out), or null. */
  async stayAt(ctx: SimulationContext, t: number): Promise<HotelStayEntity | null> {
    const stay = await this.activeStay(ctx);
    return stay && stay.startedAt <= t && t < stay.checkoutAt ? stay : null;
  }

  async view(ctx: SimulationContext): Promise<HotelsDto> {
    const here = ctx.character.travel === null ? ctx.character.locationId : null;
    const city = ctx.character.cityId;
    const offers = HOTELS.map((hotel) => this.offer(ctx, hotel, here));
    // The city you are in first.
    const hotels = offers.toSorted((a, b) => Number(b.cityId === city) - Number(a.cityId === city) || b.nightlyRate - a.nightlyRate);
    const stay = await this.activeStay(ctx);
    return { hotels, stay: stay ? this.toDto(stay) : null, maxNights: HOTEL_MAX_NIGHTS };
  }

  offer(ctx: SimulationContext, hotel: HotelDefinition, here: string | null): HotelOfferDto {
    const venue = hotelVenue(hotel);
    return {
      venueId: hotel.venueId,
      name: venue.name,
      cityId: cityOfDistrict(venue.districtId),
      districtId: venue.districtId,
      tier: hotel.tier,
      tierLabel: HOTEL_TIER_INFO[hotel.tier].label,
      nightlyRate: ctx.world.price(hotel.nightlyRate, ctx.time),
      amenities: hotel.amenities,
      tagline: hotel.tagline,
      here: here === hotel.venueId,
    };
  }

  toDto(stay: HotelStayEntity): HotelStayDto {
    const hotel = findHotel(stay.venueId);
    const venue = findVenue(stay.venueId);
    const districtId = venue?.districtId ?? 'ikeja';
    return {
      id: stay.id,
      venueId: stay.venueId,
      name: venue?.name ?? 'Hotel',
      cityId: DISTRICTS[districtId].cityId,
      districtId,
      tier: hotel?.tier ?? 'standard',
      nights: stay.nights,
      nightlyRate: stay.nightlyRate,
      totalPaid: stay.totalPaid,
      startedAt: stay.startedAt,
      checkoutAt: stay.checkoutAt,
      status: stay.status,
    };
  }

  /** What the snapshot summary carries (HUD, Map, the room's actions). */
  async summary(ctx: SimulationContext): Promise<StaySummaryDto | null> {
    const stay = await this.stayAt(ctx, ctx.time);
    if (!stay) return null;
    const dto = this.toDto(stay);
    return { stayId: stay.id, venueId: stay.venueId, name: dto.name, cityId: dto.cityId, districtId: dto.districtId, checkoutAt: stay.checkoutAt };
  }

  /**
   * Bedtime in a city where you have no home and no room: a note pointing at the hotels (once a night, when a stretch of
   * time crosses `NO_HOME_NOTE_HOUR`). With a home here, or a booked room, nothing is said.
   */
  async noteNoBed(ctx: SimulationContext, from: number, to: number): Promise<void> {
    const character = ctx.character;
    if (!character.alive || character.travel !== null) return;
    const bedtime = startOfDay(to) + NO_HOME_NOTE_HOUR * MINUTES_PER_HOUR;
    if (!(from < bedtime && bedtime <= to)) return;
    if (hasHomeInCity(character.homeDistrictId, character.cityId)) return;
    if (await this.stayAt(ctx, bedtime)) return;
    const hotels = hotelsInCity(character.cityId).length;
    if (hotels === 0) return;
    ctx.notify({
      kind: 'system',
      title: 'Nowhere to sleep? 🛎️',
      body: `You have no home in ${getCity(character.cityId).name}. Book a room at one of its ${hotels} hotels (Stay app, at the reception) or you will nap wherever you stand.`,
      tone: 'neutral',
      gameMinute: bedtime,
    });
  }

  // ----- Commands --------------------------------------------------------------------------------------------------

  /** Book `nights` at the hotel you are standing in, or extend your stay there. Charged once through the ledger. */
  async book(ctx: SimulationContext, venueId: string, nights: number): Promise<HotelBookingResultDto> {
    const character = ctx.character;
    if (!character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    const hotel = findHotel(venueId);
    if (!hotel) throw new ResourceNotFoundException('Hotel');
    if (!Number.isInteger(nights) || nights < 1 || nights > HOTEL_MAX_NIGHTS) {
      throw new GameRuleException('BAD_NIGHTS', `Book between 1 and ${HOTEL_MAX_NIGHTS} nights at a time`);
    }
    const venue = hotelVenue(hotel);
    if (character.travel !== null || character.locationId !== venueId) {
      throw new GameRuleException('NOT_AT_RECEPTION', `Go to ${venue.name} and book at the reception desk`);
    }
    const active = await this.activeStay(ctx);
    if (active && active.venueId !== venueId) {
      throw new GameRuleException('ALREADY_STAYING', `You already have a room at ${findVenue(active.venueId)?.name ?? 'another hotel'}. Check out first`);
    }
    const nightlyRate = ctx.world.price(hotel.nightlyRate, ctx.time);
    const price = nightlyRate * nights;
    if (!ctx.wallet.canAfford(price)) throw new InsufficientFundsException(price);

    let stay: HotelStayEntity;
    let key: string;
    if (active) {
      if (active.nights + nights > MAX_STAY_NIGHTS) {
        throw new GameRuleException('STAY_TOO_LONG', `A stay can run ${MAX_STAY_NIGHTS} nights in all. Check out and book again`);
      }
      stay = active;
      key = `hotel-stay:${stay.id}:ext:${stay.checkoutAt}`;
      stay.nights += nights;
      stay.checkoutAt += nights * MINUTES_PER_DAY;
      stay.totalPaid += price;
    } else {
      stay = await ctx.manager.save(
        ctx.manager.create(HotelStayEntity, {
          characterId: character.id,
          venueId,
          nights,
          nightlyRate,
          totalPaid: price,
          startedAt: ctx.time,
          checkoutAt: stayCheckoutAt(ctx.time, nights),
          status: 'active',
        }),
      );
      key = `hotel-stay:${stay.id}`;
    }
    await ctx.wallet.pay(price, 'purchase', `${venue.name}: ${nights} night${nights === 1 ? '' : 's'}`, key, {
      metadata: { stayId: stay.id, venueId, nights, nightlyRate },
    });
    await ctx.manager.save(stay);
    this.changed(ctx, stay);

    ctx.notify({
      kind: 'system',
      title: active ? 'Stay extended 🛎️' : 'Room booked 🛎️',
      body: `${venue.name}: ${nights} night${nights === 1 ? '' : 's'}. Checkout is at ${formatClock12(stay.checkoutAt)} on day ${Math.floor(stay.checkoutAt / MINUTES_PER_DAY) + 1}. Your room is your home until then.`,
      tone: 'good',
    });
    return { stay: this.toDto(stay), nights, price, extended: active !== null, balance: ctx.wallet.cash };
  }

  /** Give the room back now (no refund). */
  async checkout(ctx: SimulationContext): Promise<HotelCheckoutResultDto> {
    const stay = await this.activeStay(ctx);
    if (!stay) throw new GameRuleException('NO_STAY', 'You have no hotel room to check out of');
    await this.end(ctx, stay, ctx.time);
    return { stay: this.toDto(stay), balance: ctx.wallet.cash };
  }

  /** Every settle: rooms whose checkout time has come are given up, and the guest is told. */
  async endDue(ctx: SimulationContext): Promise<void> {
    const stay = await this.activeStay(ctx);
    if (!stay || stay.checkoutAt > ctx.time) return;
    await this.end(ctx, stay, stay.checkoutAt);
    ctx.notify({
      kind: 'system',
      title: 'Checkout time 🧳',
      body: `Your room at ${findVenue(stay.venueId)?.name ?? 'the hotel'} is up. Book again at reception, or head home.`,
      tone: 'neutral',
    });
  }

  private async end(ctx: SimulationContext, stay: HotelStayEntity, at: number): Promise<void> {
    stay.status = 'ended';
    if (at < stay.checkoutAt) stay.checkoutAt = at;
    await ctx.manager.save(stay);
    this.changed(ctx, stay);
  }

  /** The stay changed: forget what was cached about it and about where the character sleeps. */
  private changed(ctx: SimulationContext, stay: HotelStayEntity): void {
    ctx.invalidate(STAY_MEMO);
    const first = Math.floor(ctx.time / MINUTES_PER_DAY);
    const last = Math.floor(Math.max(stay.checkoutAt, ctx.time) / MINUTES_PER_DAY) + 1;
    for (let day = first; day <= last; day++) {
      ctx.invalidate(`residence:${day}`);
      ctx.invalidate(`profile-context:${day}`);
    }
  }

  /** The city of the stay's hotel (used by the residence offer). */
  cityOf(stay: HotelStayEntity): CityId {
    return DISTRICTS[findVenue(stay.venueId)?.districtId ?? 'ikeja'].cityId;
  }
}
