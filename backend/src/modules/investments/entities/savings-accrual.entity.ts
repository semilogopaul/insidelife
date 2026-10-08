import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from '../../../database/transformers.js';

/** Savings-account interest accrued day by day on the end-of-day balance, paid (minus WHT) at month end. */
@Entity('investment_savings_accruals')
export class SavingsAccrualEntity {
  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  /** Gross interest accrued and not yet paid (fractional naira; the remainder carries over). */
  @Column({ type: 'numeric', precision: 20, scale: 4, default: 0, transformer: decimalNumber })
  accrued: number;

  @Column({ type: 'int' })
  lastAccrualDay: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
