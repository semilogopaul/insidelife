import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** A character's progress towards the Private Pilot Licence at the GAT flight school. */
@Entity('pilot_training')
export class PilotTrainingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('pilot_training_character', { unique: true })
  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  enrolledAt: number;

  /** Completed lessons. */
  @Column({ type: 'int', default: 0 })
  lessons: number;

  /** Game day index of the last lesson started (one lesson a day). */
  @Column({ type: 'int', nullable: true })
  lastLessonDay: number | null;

  /** Check-rides taken (failed ones included), so each attempt is paid and rolled once. */
  @Column({ type: 'int', default: 0 })
  checkRides: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
