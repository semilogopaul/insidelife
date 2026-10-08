import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { WeddingTier } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

export type MarriageStatus = 'active' | 'divorced' | 'widowed';

/** A marriage to an NPC (`spousePersonId`) or another player (`spouseCharacterId`, one row shared by both). */
@Entity('family_marriages')
@Index('family_marriages_character', ['characterId', 'status'])
@Index('family_marriages_spouse_character', ['spouseCharacterId', 'status'])
export class MarriageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The player whose wedding created the marriage. */
  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'uuid', nullable: true })
  spouseCharacterId: string | null;

  @Column({ type: 'uuid', nullable: true })
  spousePersonId: string | null;

  @Column({ type: 'varchar', length: 12, default: 'active' })
  status: MarriageStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  marriedAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  endedAt: number | null;

  /** White wedding tier, if any. */
  @Column({ type: 'varchar', length: 12, nullable: true })
  weddingTier: WeddingTier | null;

  @Column({ type: 'boolean', default: false })
  traditional: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
