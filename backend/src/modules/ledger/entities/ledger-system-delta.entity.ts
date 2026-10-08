import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * Pending change to a system account's balance (mint, burn, tax…). Player transactions append here instead of
 * updating the system row, so thousands of concurrent transactions never queue (or deadlock) on a few hot rows.
 * `LedgerService.rollUpSystemBalances` folds committed deltas into `ledger_accounts.balance`.
 */
@Entity('ledger_system_deltas')
export class LedgerSystemDeltaEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
