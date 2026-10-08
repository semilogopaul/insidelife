import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { HmoPlanId } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

export type HmoMembershipStatus = 'active' | 'lapsed' | 'cancelled';

/** A character's HMO (health insurance) plan. Premiums are billed monthly; at most one membership is active. */
@Entity('hmo_memberships')
@Index('hmo_memberships_character_status', ['characterId', 'status'])
export class HmoMembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 16 })
  planId: HmoPlanId;

  @Column({ type: 'varchar', length: 12, default: 'active' })
  status: HmoMembershipStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startedAt: number;

  /** Claims are honoured from here (waiting period). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  coveredFrom: number;

  /** Last game month (monthIndex) whose premium is paid. */
  @Column({ type: 'int' })
  paidThroughMonth: number;

  /** Calendar year `coverUsed` refers to. */
  @Column({ type: 'int' })
  coverYear: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  coverUsed: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  endedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
