import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { DepositProductId, DepositStatus } from '@insidelife/shared';
import { bigintNumber, decimalNumber } from '../../../database/transformers.js';

/**
 * Fixed deposits, T-bills (fixed tenor, rate locked at purchase, simple interest paid at maturity) and money-market
 * fund positions (open-ended, accrued daily, interest paid monthly). Principal sits with `system:market`.
 */
@Entity('investment_deposits')
@Index('investment_deposits_character_status', ['characterId', 'status'])
@Index('investment_deposits_character_key', ['characterId', 'idempotencyKey'], { unique: true })
export class InvestmentDepositEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 96 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 16 })
  product: DepositProductId;

  @Column({ type: 'bigint', transformer: bigintNumber })
  principal: number;

  @Column({ type: 'numeric', precision: 8, scale: 6, transformer: decimalNumber })
  annualRate: number;

  @Column({ type: 'int', nullable: true })
  tenorDays: number | null;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startedAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  maturesAt: number | null;

  /** Money-market fund: gross interest accrued and not yet paid (fractional naira). */
  @Column({ type: 'numeric', precision: 20, scale: 4, default: 0, transformer: decimalNumber })
  accrued: number;

  /** Last world day whose interest has been accrued (money-market fund). */
  @Column({ type: 'int', nullable: true })
  lastAccrualDay: number | null;

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status: DepositStatus;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  closedAt: number | null;

  /** Gross interest paid over the deposit's life. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  interestPaid: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  withholdingTax: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  penalty: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
