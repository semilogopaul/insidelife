import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RaceHow, RacerStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** One racer in a race. Written by the racer's own session (accept, decline, arrival); the winner flags under the race lock. */
@Entity('race_entries')
@Index('race_entries_race_character', ['raceId', 'characterId'], { unique: true })
@Index('race_entries_character', ['characterId'])
export class RaceEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  raceId: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 10 })
  status: RacerStatus;

  /** Game minute they arrived in the destination city. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  finishedAt: number | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  how: RaceHow | null;

  /** "Gulfstream G650ER · 5N-ABC", "Air Peace P4 7102", "Interstate coach". */
  @Column({ type: 'varchar', length: 80, nullable: true })
  howLabel: string | null;

  /** First when the winner was decided. */
  @Column({ type: 'boolean', default: false })
  won: boolean;

  /** The winner's badge signal was recorded (in their own session). */
  @Column({ type: 'boolean', default: false })
  winClaimed: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
