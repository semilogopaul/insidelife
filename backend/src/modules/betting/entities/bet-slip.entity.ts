import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { BetSelectionId, BetSlipStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** One pick on a slip, priced when the slip was placed (odds never change after that). */
export interface BetSlipLeg {
  readonly matchId: string;
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
  readonly kickoffAt: number;
  readonly selection: BetSelectionId;
  /** Hundredths (2.35 → 235). */
  readonly odds: number;
}

/**
 * A betting slip (a single or an accumulator), always against the house. The stake left the game when it was placed
 * (`bet-stake:<idempotencyKey>`); the bettor's own session settles it once every match is over and pays any winnings
 * exactly once (`bet-win:<id>`).
 */
@Entity('betting_slips')
@Index('betting_slips_idempotency', ['characterId', 'idempotencyKey'], { unique: true })
@Index('betting_slips_character_placed', ['characterId', 'placedAt'])
@Index('betting_slips_character_day', ['characterId', 'placedDay'])
@Index('betting_slips_due', ['characterId', 'settlesAt'], { where: `"status" = 'open'` })
export class BetSlipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  stake: number;

  /** Stake × odds rounded down, capped at the most a slip may pay. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  potentialReturns: number;

  @Column({ type: 'boolean', default: false })
  capped: boolean;

  @Column({ type: 'jsonb' })
  legs: BetSlipLeg[];

  @Column({ type: 'varchar', length: 8, default: 'open' })
  status: BetSlipStatus;

  @Column({ type: 'bigint', transformer: bigintNumber, default: 0 })
  payout: number;

  /** Game minute placed, and its game day (daily loss limit). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  placedAt: number;

  @Column({ type: 'int' })
  placedDay: number;

  /** Full time of the last match on the slip (game minute). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  settlesAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber, nullable: true })
  settledAt: number | null;

  @Column({ type: 'int', nullable: true })
  settledDay: number | null;

  @Column({ type: 'varchar', length: 64 })
  idempotencyKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
