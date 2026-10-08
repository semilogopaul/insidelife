import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { FxSide, OrderSide } from '@insidelife/shared';
import { bigintNumber, decimalNumber } from '../../../database/transformers.js';

/** Instrument id used for FX desk trades in the trade history. */
export const FX_INSTRUMENT_ID = 'USD';

/**
 * Executed trades (stocks, crypto and FX). The per-character idempotency key makes retried orders return the
 * original execution instead of trading twice.
 */
@Entity('investment_trades')
@Index('investment_trades_character_key', ['characterId', 'idempotencyKey'], { unique: true })
@Index('investment_trades_character_created', ['characterId', 'createdAt'])
export class InvestmentTradeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 96 })
  idempotencyKey: string;

  /** Ticker, or `USD` for the FX desk. */
  @Column({ type: 'varchar', length: 16 })
  instrumentId: string;

  @Column({ type: 'varchar', length: 8 })
  side: OrderSide | FxSide;

  /** Micro-units for instruments; US cents for FX. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  quantity: number;

  /** Naira per unit (or per dollar for FX, spread included). */
  @Column({ type: 'numeric', precision: 24, scale: 8, transformer: decimalNumber })
  price: number;

  /** Naira value before fees (FX: naira paid or received). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  gross: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  fee: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  realizedGain: number | null;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
