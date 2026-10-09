import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * Money a character sent to and received from other players on one real UTC day (transfers, sprays and any other
 * player-to-player money). Daily limits read it; lifetime "sent" is its sum.
 */
@Entity('peer_money_days')
export class PeerMoneyDayEntity {
  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  /** UTC date, `YYYY-MM-DD`. */
  @PrimaryColumn({ type: 'date' })
  day: string;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  sent: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  received: number;
}
