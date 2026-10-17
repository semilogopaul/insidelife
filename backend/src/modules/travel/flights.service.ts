import { Injectable } from '@nestjs/common';
import { In, Not } from 'typeorm';
import {
  CITIES,
  FLIGHT_CABINS,
  FLIGHT_CHANGE_FEE,
  INTERSTATE_BUS,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  boardingPassSeat,
  findFlight,
  findVenue,
  flightBookable,
  flightChangeCost,
  flightFare,
  flightWindows,
  flightsBetween,
  formatNaira,
  isInterruptibleActivity,
  otherCity,
  type CityId,
  type FlightBookingDto,
  type FlightCabin,
  type FlightChannel,
  type FlightDefinition,
  type FlightSearchDto,
  type FlightsOverviewDto,
  type InterstateBusDto,
} from '@insidelife/shared';
import { ConflictException, GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { FlightBookingEntity } from './entities/flight-booking.entity.js';
import { effectiveStatus, toBookingDto, toFlightDto } from './travel.rules.js';

/** Bookings stay on the Flights app this long after they land. */
const RECENT_MINUTES = 2 * MINUTES_PER_DAY;
/** The app lists the next two days of departures. */
const LISTING_MINUTES = 2 * MINUTES_PER_DAY;

/**
 * Commercial flights Lagos ↔ Abuja: timetable, booking (Flights app or airport counter), check-in at the airport,
 * boarding at the gate, changing a missed flight. Every charge goes through the ledger with a key derived from the
 * flight, so a retry can never buy a seat twice.
 */
@Injectable()
export class FlightsService {
  // ----- reading ---------------------------------------------------------------------------------------------------

  async overview(ctx: SimulationContext): Promise<FlightsOverviewDto> {
    await this.markMissed(ctx);
    const city = ctx.character.cityId;
    const flights = flightsBetween(ctx.world.seed, city, ctx.time, ctx.time + LISTING_MINUTES).map((flight) => toFlightDto(flight, ctx.time));
    return {
      cityId: city,
      otherCityId: otherCity(city),
      airportVenueId: CITIES[city].airportVenueId,
      atAirport: this.atAirport(ctx, CITIES[city].airportVenueId),
      flights,
      bookings: await this.bookings(ctx),
      bus: this.busOffer(ctx),
      changeFee: FLIGHT_CHANGE_FEE,
      now: ctx.time,
    };
  }

  /** Departures from a city on a day: `day` counts days from today (0 = today's remaining flights). */
  search(ctx: SimulationContext, fromCity: CityId, day: number): FlightSearchDto {
    const start = Math.floor(ctx.time / MINUTES_PER_DAY) * MINUTES_PER_DAY + day * MINUTES_PER_DAY;
    const from = Math.max(ctx.time, start);
    const flights = flightsBetween(ctx.world.seed, fromCity, from, start + MINUTES_PER_DAY).map((flight) => toFlightDto(flight, ctx.time));
    return { cityId: fromCity, day, flights };
  }

  async bookings(ctx: SimulationContext): Promise<FlightBookingDto[]> {
    const rows = await ctx.manager.find(FlightBookingEntity, {
      where: { characterId: ctx.character.id, status: Not(In(['changed', 'cancelled'])) },
      order: { departAt: 'DESC' },
      take: 40,
    });
    const out: FlightBookingDto[] = [];
    for (const row of rows) {
      const flight = findFlight(ctx.world.seed, row.flightId);
      if (!flight) continue;
      const status = effectiveStatus(row, ctx.time);
      // Landed a while ago: off the list.
      if ((status === 'flown' || status === 'missed') && ctx.time - flight.arriveAt > RECENT_MINUTES) continue;
      out.push(toBookingDto(row, flight, ctx.time, this.atAirport(ctx, flight.fromAirportVenueId)));
    }
    return out;
  }

  // ----- booking ---------------------------------------------------------------------------------------------------

  /** Buy a seat. From the app anywhere; at the counter only standing in the departure airport (and you're checked in on the spot). */
  async book(ctx: SimulationContext, flightId: string, cabin: FlightCabin, channel: FlightChannel): Promise<FlightBookingDto> {
    this.assertAlive(ctx);
    if (!(FLIGHT_CABINS as readonly string[]).includes(cabin)) throw new GameRuleException('BAD_CABIN', 'Pick economy or business');
    const flight = this.flightOrThrow(ctx, flightId);
    if (channel === 'counter' && !this.atAirport(ctx, flight.fromAirportVenueId)) {
      throw new GameRuleException('NOT_AT_AIRPORT', `The ticket counter is at ${airportName(flight.fromAirportVenueId)}. Use the Flights app from anywhere.`);
    }
    if (!flightBookable(flight, ctx.time)) {
      throw new GameRuleException('FLIGHT_CLOSED', `Check-in has closed for ${flight.number}. Pick a later flight.`);
    }

    const existing = await this.liveBooking(ctx, flight.id);
    if (existing) {
      if (existing.cabin !== cabin) throw new ConflictException('ALREADY_BOOKED', 'You already hold a seat on this flight in another cabin');
      return this.dto(ctx, existing, flight);
    }

    const fare = flightFare(flight, cabin);
    await ctx.wallet.pay(fare, 'transport', `${flight.number} ${CITIES[flight.fromCity].name} to ${CITIES[flight.toCity].name} (${cabin})`, `flight:book:${flight.id}`);
    const { seat, gate } = boardingPassSeat(`${ctx.character.id}:${flight.id}`, cabin);
    const w = flightWindows(flight);
    const booking = await ctx.manager.save(
      ctx.manager.create(FlightBookingEntity, {
        characterId: ctx.character.id,
        flightId: flight.id,
        cabin,
        fare,
        // A walk-up sale at the counter comes with the boarding pass once check-in is open.
        status: channel === 'counter' && ctx.time >= w.checkInOpensAt ? 'checked-in' : 'booked',
        channel,
        seat,
        gate,
        bookedAt: ctx.time,
        departAt: flight.departAt,
        arriveAt: flight.arriveAt,
        changedFrom: null,
      }),
    );
    return this.dto(ctx, booking, flight);
  }

  /** Check in at the departure airport while check-in is open (it closes 45 minutes before departure). */
  async checkIn(ctx: SimulationContext, bookingId: string): Promise<FlightBookingDto> {
    this.assertAlive(ctx);
    const { booking, flight } = await this.mine(ctx, bookingId);
    const status = effectiveStatus(booking, ctx.time);
    if (status === 'checked-in') return this.dto(ctx, booking, flight);
    if (status === 'missed') throw new GameRuleException('FLIGHT_MISSED', `You missed ${flight.number}. Change it for ${formatNaira(FLIGHT_CHANGE_FEE)}.`);
    if (status !== 'booked') throw new GameRuleException('BAD_STATE', 'This booking can’t be checked in');
    this.assertAtAirport(ctx, flight);
    const w = flightWindows(flight);
    if (ctx.time < w.checkInOpensAt) throw new GameRuleException('TOO_EARLY', 'Check-in isn’t open yet');
    if (ctx.time >= w.checkInClosesAt) throw new GameRuleException('CHECK_IN_CLOSED', 'Check-in has closed. You can change to another flight for the change fee.');
    booking.status = 'checked-in';
    await ctx.manager.save(FlightBookingEntity, booking);
    return this.dto(ctx, booking, flight);
  }

  /** Board at the gate: the character takes off with the flight and lands at the other city's airport. */
  async board(ctx: SimulationContext, bookingId: string): Promise<FlightBookingDto> {
    this.assertAlive(ctx);
    const { booking, flight } = await this.mine(ctx, bookingId);
    const status = effectiveStatus(booking, ctx.time);
    if (status === 'boarded') return this.dto(ctx, booking, flight);
    if (status === 'missed') throw new GameRuleException('FLIGHT_MISSED', `The gate for ${flight.number} has closed. Change it for ${formatNaira(FLIGHT_CHANGE_FEE)}.`);
    if (status !== 'checked-in') throw new GameRuleException('NOT_CHECKED_IN', status === 'booked' ? 'Check in first' : 'This booking can’t be boarded');
    this.assertAtAirport(ctx, flight);
    const w = flightWindows(flight);
    if (ctx.time < w.boardingOpensAt) throw new GameRuleException('GATE_NOT_OPEN', `Gate ${booking.gate} opens soon. Wait airside.`);
    const character = ctx.character;
    if (character.travel) throw new GameRuleException('TRAVELLING', 'You’re already on the move');
    if (character.activity && !isInterruptibleActivity(character.activity)) throw new GameRuleException('BUSY', 'Finish or cancel what you’re doing first');

    booking.status = 'boarded';
    await ctx.manager.save(FlightBookingEntity, booking);
    character.activity = null;
    character.travel = {
      fromLocationId: flight.fromAirportVenueId,
      toLocationId: flight.toAirportVenueId,
      mode: 'flight',
      flightId: flight.id,
      departAt: ctx.time,
      arriveAt: flight.arriveAt,
      fare: 0,
      explicit: true,
    };
    return this.dto(ctx, booking, flight);
  }

  /**
   * Change to another flight the same way (a missed one, or a booked one before check-in closes): the change fee plus
   * any fare difference, nothing back for a cheaper one. The old booking is closed and a new one written.
   */
  async change(ctx: SimulationContext, bookingId: string, newFlightId: string): Promise<FlightBookingDto> {
    this.assertAlive(ctx);
    const { booking, flight: oldFlight } = await this.mine(ctx, bookingId);
    const status = effectiveStatus(booking, ctx.time);
    const w = flightWindows(oldFlight);
    const changeable = status === 'missed' || ((status === 'booked' || status === 'checked-in') && ctx.time < w.checkInClosesAt);
    if (!changeable) throw new GameRuleException('NOT_CHANGEABLE', 'This booking can’t be changed');
    const flight = this.flightOrThrow(ctx, newFlightId);
    if (flight.fromCity !== oldFlight.fromCity) throw new GameRuleException('WRONG_ROUTE', `Pick a flight from ${CITIES[oldFlight.fromCity].name}`);
    if (flight.id === oldFlight.id) throw new GameRuleException('SAME_FLIGHT', 'Pick a different flight');
    if (!flightBookable(flight, ctx.time)) throw new GameRuleException('FLIGHT_CLOSED', `Check-in has closed for ${flight.number}. Pick a later flight.`);
    const taken = await this.liveBooking(ctx, flight.id);
    if (taken) throw new ConflictException('ALREADY_BOOKED', 'You already hold a seat on that flight');

    const fare = flightFare(flight, booking.cabin);
    const cost = flightChangeCost(booking.fare, fare);
    await ctx.wallet.pay(cost, 'transport', `Change ${oldFlight.number} to ${flight.number}`, `flight:change:${oldFlight.id}:${flight.id}`);
    booking.status = 'changed';
    await ctx.manager.save(FlightBookingEntity, booking);
    const { seat, gate } = boardingPassSeat(`${ctx.character.id}:${flight.id}`, booking.cabin);
    const next = await ctx.manager.save(
      ctx.manager.create(FlightBookingEntity, {
        characterId: ctx.character.id,
        flightId: flight.id,
        cabin: booking.cabin,
        fare,
        status: 'booked',
        channel: booking.channel,
        seat,
        gate,
        bookedAt: ctx.time,
        departAt: flight.departAt,
        arriveAt: flight.arriveAt,
        changedFrom: booking.id,
      }),
    );
    return this.dto(ctx, next, flight);
  }

  // ----- the bus (offered next to flights) ---------------------------------------------------------------------------

  busOffer(ctx: SimulationContext): InterstateBusDto {
    const city = ctx.character.cityId;
    const economy = ctx.world.economy(ctx.time);
    const fare = Math.round((INTERSTATE_BUS.fare * economy.priceIndex * economy.fareMultiplier) / 50) * 50;
    const station = CITIES[city].busStationVenueId;
    const here = ctx.character.locationId === station && !ctx.character.travel;
    return {
      toCity: otherCity(city),
      fare,
      minutes: INTERSTATE_BUS.hours * MINUTES_PER_HOUR + 30,
      stationVenueId: station,
      available: here,
      ...(here ? {} : { reason: `The coach leaves from ${airportName(station)}.` }),
    };
  }

  // ----- helpers ---------------------------------------------------------------------------------------------------

  /** Flights that reached their gate-closing time unboarded are missed: say so once, and keep the row honest. */
  private async markMissed(ctx: SimulationContext): Promise<void> {
    const rows = await ctx.manager.find(FlightBookingEntity, { where: { characterId: ctx.character.id, status: In(['booked', 'checked-in']) } });
    for (const row of rows) {
      if (effectiveStatus(row, ctx.time) !== 'missed') continue;
      const flight = findFlight(ctx.world.seed, row.flightId);
      row.status = 'missed';
      await ctx.manager.save(FlightBookingEntity, row);
      ctx.notify({
        kind: 'travel',
        title: `You missed ${flight?.number ?? 'your flight'}`,
        body: `Change to another flight for ${formatNaira(FLIGHT_CHANGE_FEE)} (plus any fare difference) in the Flights app.`,
        tone: 'bad',
        gameMinute: row.departAt,
      });
    }
  }

  private dto(ctx: SimulationContext, booking: FlightBookingEntity, flight: FlightDefinition): FlightBookingDto {
    return toBookingDto(booking, flight, ctx.time, this.atAirport(ctx, flight.fromAirportVenueId));
  }

  private async mine(ctx: SimulationContext, bookingId: string): Promise<{ booking: FlightBookingEntity; flight: FlightDefinition }> {
    const booking = await ctx.manager.findOne(FlightBookingEntity, { where: { id: bookingId, characterId: ctx.character.id } });
    const flight = booking ? findFlight(ctx.world.seed, booking.flightId) : null;
    if (!booking || !flight) throw new ResourceNotFoundException('Booking');
    return { booking, flight };
  }

  private liveBooking(ctx: SimulationContext, flightId: string): Promise<FlightBookingEntity | null> {
    return ctx.manager.findOne(FlightBookingEntity, { where: { characterId: ctx.character.id, flightId, status: Not(In(['changed', 'cancelled'])) } });
  }

  private flightOrThrow(ctx: SimulationContext, flightId: string): FlightDefinition {
    const flight = findFlight(ctx.world.seed, flightId);
    if (!flight) throw new ResourceNotFoundException('Flight');
    return flight;
  }

  private atAirport(ctx: SimulationContext, airportVenueId: string): boolean {
    return ctx.character.locationId === airportVenueId && !ctx.character.travel;
  }

  private assertAtAirport(ctx: SimulationContext, flight: FlightDefinition): void {
    if (!this.atAirport(ctx, flight.fromAirportVenueId)) {
      throw new GameRuleException('NOT_AT_AIRPORT', `Check-in and the gate are at ${airportName(flight.fromAirportVenueId)}. Get there first.`);
    }
  }

  private assertAlive(ctx: SimulationContext): void {
    if (!ctx.character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
  }
}

function airportName(venueId: string): string {
  return findVenue(venueId)?.name ?? 'the airport';
}
