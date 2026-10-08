import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** An achievement a character has unlocked. */
@Entity('progression_achievements')
@Index('progression_achievements_character_achievement', ['characterId', 'achievementId'], { unique: true })
@Index('progression_achievements_achievement', ['achievementId'])
export class AchievementUnlockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 48 })
  achievementId: string;

  /** Game minute of the unlock. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  unlockedAt: number;

  /** Clout actually granted (0 once the progression cap is reached). */
  @Column({ type: 'int', default: 0 })
  clout: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
