import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** One month of trading for one business. Unique per (business, month): month-end can never run twice. */
@Entity('business_pnl')
@Index('business_pnl_business_month', ['businessId', 'monthIndex'], { unique: true })
@Index('business_pnl_character_month', ['characterId', 'monthIndex'])
export class BusinessPnlEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'int' })
  monthIndex: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  revenue: number;

  /** Variable + fixed costs. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  costs: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  eventCosts: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  tax: number;

  /** After tax (negative = loss). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  profit: number;

  /** What reached (positive) or left (negative) the owner's wallet. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  ownerCashFlow: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  debtAfter: number;

  @Column({ type: 'jsonb', default: [] })
  notes: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
