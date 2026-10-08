import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { FuneralTier } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** One handover in a dynasty: who died, who continued, and what the estate came to. */
@Entity('family_successions')
@Index('family_successions_user', ['userId', 'createdAtGame'])
export class SuccessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  dynastyId: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  deceasedCharacterId: string;

  @Column({ type: 'varchar', length: 82 })
  deceasedName: string;

  @Column({ type: 'int' })
  generation: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  diedAt: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  causeOfDeath: string | null;

  @Column({ type: 'uuid', nullable: true })
  heirCharacterId: string | null;

  @Column({ type: 'uuid', nullable: true })
  heirPersonId: string | null;

  @Column({ type: 'varchar', length: 82, nullable: true })
  heirName: string | null;

  /** The heir was younger than 17 and was raised by family until they could take over. */
  @Column({ type: 'boolean', default: false })
  agedUp: boolean;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gross: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  funeral: number;

  @Column({ type: 'varchar', length: 16 })
  funeralTier: FuneralTier;

  @Column({ type: 'bigint', transformer: bigintNumber })
  probate: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  inherited: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  createdAtGame: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
