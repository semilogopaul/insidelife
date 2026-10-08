import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { LedgerKind } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** Flat, JSON-safe metadata attached to a posting (references, rates, quantities). */
export type LedgerMetadata = Readonly<Record<string, string | number | boolean | null>>;

/** A balanced group of entries. The idempotency key makes every posting safe to retry. */
@Entity('ledger_transactions')
@Index('ledger_transactions_character_created', ['characterId', 'createdAt'])
export class LedgerTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 32 })
  kind: LedgerKind;

  @Column({ type: 'varchar', length: 200 })
  memo: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  /** Primary character this posting is about (for statements). */
  @Column({ type: 'uuid', nullable: true })
  characterId: string | null;

  @Column({ type: 'uuid', nullable: true })
  counterpartyCharacterId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: LedgerMetadata;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
