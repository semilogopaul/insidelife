import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CityId, RaceStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A race between friends from one city to the other. Created `pending` by the challenger; the clock starts (`running`) when
 * the last invited friend accepts. Racers' arrivals are recorded on their `RaceEntryEntity` rows, each by the racer's own
 * session; the race row itself is only written under its own row lock.
 */
@Entity('races')
@Index('races_status_expires', ['status', 'expiresAt'])
export class RaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  challengerId: string;

  @Column({ type: 'varchar', length: 12 })
  fromCity: CityId;

  @Column({ type: 'varchar', length: 12 })
  toCity: CityId;

  @Column({ type: 'varchar', length: 12 })
  status: RaceStatus;

  /** Game minute of the challenge. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  createdAtMinute: number;

  /** Game minute the clock started (the last acceptance). */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  startedAt: number | null;

  /** The invitation lapses / the race ends at this game minute. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  expiresAt: number;

  /** Game minute the winner became known (set once). */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  decidedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
