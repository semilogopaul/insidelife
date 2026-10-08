import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** One spray: `amount` of whole notes from one guest to another, backed by one balanced ledger posting. */
@Entity('social_sprays')
@Index('social_sprays_idempotency', ['fromId', 'idempotencyKey'], { unique: true })
@Index('social_sprays_party_from', ['partyId', 'fromId'])
@Index('social_sprays_party_to', ['partyId', 'toId'])
export class SprayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  partyId: string;

  @Column({ type: 'uuid' })
  fromId: string;

  @Column({ type: 'uuid' })
  toId: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @Column({ type: 'varchar', length: 64 })
  idempotencyKey: string;

  @Column({ type: 'uuid' })
  ledgerTransactionId: string;

  /** EFCC fine charged with this spray (0 if none). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  fine: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
