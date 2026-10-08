import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** One leg of a transaction. Entries are append-only. */
@Entity('ledger_entries')
@Index('ledger_entries_account_created', ['accountId', 'createdAt'])
export class LedgerEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  /** Signed amount: positive credits the account. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  /** Running balance after this leg; null on system accounts, whose balances are rolled up asynchronously. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  balanceAfter: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
