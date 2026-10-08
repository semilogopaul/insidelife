import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** A position in one stock or crypto asset. Units are integer micro-units (1 unit = 1,000,000). */
@Entity('investment_holdings')
@Index('investment_holdings_character_instrument', ['characterId', 'instrumentId'], { unique: true })
export class InvestmentHoldingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 16 })
  instrumentId: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  microUnits: number;

  /** Naira paid for the units still held, fees included (reduced pro rata on sells). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  costBasis: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
