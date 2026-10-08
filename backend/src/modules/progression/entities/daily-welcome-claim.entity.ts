import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** One daily welcome per account per Africa/Lagos calendar day (heirs and new lives share the account's claim). */
@Entity('progression_daily_welcomes')
@Index('progression_daily_welcomes_user_date', ['userId', 'realDate'], { unique: true })
@Index('progression_daily_welcomes_character', ['characterId'])
export class DailyWelcomeClaimEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  characterId: string;

  /** YYYY-MM-DD in Africa/Lagos. */
  @Column({ type: 'varchar', length: 10 })
  realDate: string;

  @Column({ type: 'varchar', length: 40 })
  flavourId: string;

  @Column({ type: 'int' })
  cash: number;

  @Column({ type: 'int' })
  moodBoost: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @CreateDateColumn({ type: 'timestamptz' })
  claimedAt: Date;
}
