import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { NightOutItemId, VenueMomentKind } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A paid moment in a club or bar (bottle sent, DJ shoutout, experience). The row is the purchase record, the
 * shoutout queue (`startsAt`/`endsAt` per place, real time) and, for bottles and birthdays, a pending effect on the
 * person it's for: `recipientApplied = false` until their own session settles and applies the mood lift.
 */
@Entity('social_night_moments')
@Index('social_night_moments_idempotency', ['fromId', 'idempotencyKey'], { unique: true })
@Index('social_night_moments_sender_night', ['fromId', 'night'])
@Index('social_night_moments_venue_ends', ['venueId', 'endsAt'])
@Index('social_night_moments_pending', ['toId'], { where: '"recipient_applied" = false' })
export class NightMomentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  venueId: string;

  /** `sprayNightIndex(gameMinute)`: nights run 06:00 to 06:00. */
  @Column({ type: 'int' })
  night: number;

  @Column({ type: 'varchar', length: 32 })
  itemId: NightOutItemId;

  @Column({ type: 'varchar', length: 24 })
  kind: VenueMomentKind;

  @Column({ type: 'uuid' })
  fromId: string;

  @Column({ type: 'varchar', length: 20 })
  fromHandle: string;

  @Column({ type: 'varchar', length: 40 })
  fromFirstName: string;

  /** Who it's for (bottles, a birthday for someone else). */
  @Column({ type: 'uuid', nullable: true })
  toId: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  toHandle: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  toFirstName: string | null;

  /** Shoutout text as shown (kept for moderation and reports). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  message: string | null;

  @Column({ type: 'bigint', transformer: bigintNumber })
  price: number;

  @Column({ type: 'int', default: 0 })
  clout: number;

  /** When it plays for the room (real time: shoutouts queue one after another per place). */
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @Column({ type: 'varchar', length: 64 })
  idempotencyKey: string;

  /** Mood lift for `toId`, applied in their own session (0: nothing to apply). */
  @Column({ type: 'smallint', default: 0 })
  recipientMood: number;

  @Column({ type: 'boolean', default: true })
  recipientApplied: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
