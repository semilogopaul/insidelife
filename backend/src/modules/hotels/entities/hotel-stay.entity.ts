import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { HotelStayStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A hotel room a character has booked. One active stay per character at a time; until `checkoutAt` it is their
 * temporary home (`HotelsSystem.residence`). Money paid is in the ledger under `hotel-stay:<id>` keys.
 */
@Entity('hotel_stays')
export class HotelStayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('hotel_stays_character')
  @Column({ type: 'uuid' })
  characterId: string;

  /** The hotel's venue id. */
  @Column({ type: 'varchar', length: 64 })
  venueId: string;

  @Column({ type: 'int' })
  nights: number;

  /** What a night cost when booked (₦). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  nightlyRate: number;

  /** Everything paid for this stay, extensions included (₦). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  totalPaid: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startedAt: number;

  /** Noon of the last morning: the room is theirs until then. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  checkoutAt: number;

  @Column({ type: 'varchar', length: 8, default: 'active' })
  status: HotelStayStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
