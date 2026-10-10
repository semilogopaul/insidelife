import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A debt a character took on when a refund (or chargeback) of a top-up couldn't take all the coins back: one row per
 * refund, so the same refund reported again never adds the debt twice. The outstanding total lives on the character
 * (`characters.debt`) and is repaid automatically from money that comes in (`CharacterWallet.collectDebt`).
 */
@Entity('character_debts')
@Index('character_debts_refund', ['reference', 'refundId'], { unique: true })
export class CharacterDebtEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('character_debts_character')
  @Column({ type: 'uuid' })
  characterId: string;

  /** Payment reference of the refunded top-up. */
  @Column({ type: 'varchar', length: 64 })
  reference: string;

  @Column({ type: 'varchar', length: 40 })
  refundId: string;

  /** In-game naira that couldn't be clawed back. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
