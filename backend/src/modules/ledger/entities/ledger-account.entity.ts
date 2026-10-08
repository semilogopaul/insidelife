import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

export type LedgerAccountKind = 'cash' | 'savings' | 'pension' | 'usd' | 'system';
export type LedgerCurrency = 'NGN' | 'USD';

/**
 * A balance holder. Player accounts can never go negative (DB CHECK); system accounts (mint, burn, tax…) may, which
 * is what makes the money supply auditable: −(mint + topup) − (burn + tax + fees) = Σ player balances.
 */
@Entity('ledger_accounts')
@Check('ledger_accounts_non_negative', '"allow_negative" OR "balance" >= 0')
@Index('ledger_accounts_owner_kind', ['ownerId', 'kind'], { unique: true, where: '"owner_id" IS NOT NULL' })
export class LedgerAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Character id for player accounts; null for system accounts. */
  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind: LedgerAccountKind;

  /** Stable code for system accounts, e.g. `system:mint`. */
  @Index({ unique: true, where: '"code" IS NOT NULL' })
  @Column({ type: 'varchar', length: 48, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: LedgerCurrency;

  /** Whole naira (or US cents for USD accounts). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  balance: number;

  @Column({ type: 'boolean', default: false })
  allowNegative: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
