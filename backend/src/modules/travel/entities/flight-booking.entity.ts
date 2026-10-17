import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { FlightBookingStatus, FlightCabin, FlightChannel } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A seat on a commercial flight. The flight itself is never stored: `flightId` rebuilds it from the world seed
 * (`findFlight`), so the timetable and fares cannot drift from what the player was shown. A character holds at most one
 * live booking per flight; changing a flight marks the old row `changed` and writes a new one.
 */
@Entity('flight_bookings')
@Index('flight_bookings_character', ['characterId', 'departAt'])
@Index('flight_bookings_one_seat_per_flight', ['characterId', 'flightId'], { unique: true, where: `"status" NOT IN ('changed', 'cancelled')` })
export class FlightBookingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 64 })
  flightId: string;

  @Column({ type: 'varchar', length: 12 })
  cabin: FlightCabin;

  /** What the seat cost (₦). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  fare: number;

  @Column({ type: 'varchar', length: 12 })
  status: FlightBookingStatus;

  @Column({ type: 'varchar', length: 8 })
  channel: FlightChannel;

  @Column({ type: 'varchar', length: 4 })
  seat: string;

  @Column({ type: 'varchar', length: 4 })
  gate: string;

  /** Game minute of the purchase. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  bookedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  departAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  arriveAt: number;

  /** The booking this one replaced (a missed or changed flight). */
  @Column({ type: 'uuid', nullable: true })
  changedFrom: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
