import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ProposalKind, ProposalStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A request from one player to another (friendship, dating, marriage, a baby). The recipient answers in their own
 * session; the proposer's side is reconciled in the proposer's next session (`proposerSynced`).
 */
@Entity('family_proposals')
@Index('family_proposals_to', ['toCharacterId', 'status'])
@Index('family_proposals_from', ['fromCharacterId', 'status'])
@Index('family_proposals_one_pending', ['fromCharacterId', 'toCharacterId', 'kind'], { unique: true, where: `"status" = 'pending'` })
export class ProposalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  fromCharacterId: string;

  @Column({ type: 'uuid' })
  toCharacterId: string;

  @Column({ type: 'varchar', length: 12 })
  kind: ProposalKind;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: ProposalStatus;

  @Column({ type: 'varchar', length: 140, nullable: true })
  message: string | null;

  /** Engagement ring paid by the proposer (marriage proposals). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  ringValue: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  createdAtGame: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  respondedAtGame: number | null;

  /** False once answered until the proposer's session applies the answer to their own state. */
  @Column({ type: 'boolean', default: true })
  proposerSynced: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
