import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** A spray in a club or bar (no party): to a player in the room, or to the DJ (`toId` null — the money leaves the game). */
@Entity('social_venue_sprays')
@Index('social_venue_sprays_idempotency', ['fromId', 'idempotencyKey'], { unique: true })
@Index('social_venue_sprays_night', ['venueId', 'night', 'fromId'])
export class VenueSprayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  venueId: string;

  /** `sprayNightIndex(gameMinute)`: nights run 06:00 to 06:00. */
  @Column({ type: 'int' })
  night: number;

  @Column({ type: 'uuid' })
  fromId: string;

  @Column({ type: 'uuid', nullable: true })
  toId: string | null;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @Column({ type: 'varchar', length: 64 })
  idempotencyKey: string;

  /** The player-to-player transfer (null for the DJ: that's a plain debit). */
  @Column({ type: 'uuid', nullable: true })
  ledgerTransactionId: string | null;

  /** EFCC fine charged with this spray (0 if none). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  fine: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
