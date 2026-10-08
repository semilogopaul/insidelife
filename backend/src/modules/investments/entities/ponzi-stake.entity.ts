import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

export type PonziStatus = 'active' | 'paid' | 'collapsed';

/**
 * Money put into a "100% in 30 days" scheme. The stake is burned when joining; the scheme's fate is fixed at join
 * time (`collapseAt`, seeded): it either collapses first (money gone) or, rarely, pays the promised double.
 */
@Entity('investment_ponzi_stakes')
@Index('investment_ponzi_stakes_character_status', ['characterId', 'status'])
export class PonziStakeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 48 })
  scheme: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  promisedPayout: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  joinedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  payoutAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  collapseAt: number;

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status: PonziStatus;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  resolvedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
