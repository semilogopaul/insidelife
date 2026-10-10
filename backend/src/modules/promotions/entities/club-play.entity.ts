import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * One paid song played in one club at one scheduled slot (shared `club-schedule.ts`). Written by the play recorder when
 * the slot starts; `slotIndex` is unique across Lagos, so recording twice (several API nodes) is a no-op. `audience`
 * is how many different players were in the club during the play (the artist not counted).
 */
@Entity('promotion_club_plays')
@Index('promotion_club_plays_slot', ['slotIndex'], { unique: true })
@Index('promotion_club_plays_order_starts', ['orderId', 'startsAt'])
@Index('promotion_club_plays_venue_starts', ['venueId', 'startsAt'])
@Index('promotion_club_plays_starts', ['startsAt'])
export class ClubPlayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  slotIndex: number;

  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'uuid' })
  trackId: string;

  @Column({ type: 'varchar', length: 64 })
  venueId: string;

  /** Game minute the slot starts. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  /** When the song ends (start + its length). */
  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'integer', default: 0 })
  audience: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
