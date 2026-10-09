import type { HostTreatId } from '@insidelife/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * One treat served to one guest (a host's order makes a row per guest inside). The host's session writes it and pays;
 * the guest's own session applies its effects (`appliedAt`), so no session ever writes another player's character.
 * It also drives what's on the host's table until `until`.
 */
@Entity('home_treats')
@Index('home_treats_order', ['hostId', 'orderKey', 'guestId'], { unique: true })
@Index('home_treats_pending', ['guestId'], { where: '"applied_at" IS NULL' })
@Index('home_treats_host_until', ['hostId', 'until'])
@Index('home_treats_visit', ['visitId'])
export class HomeTreatEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  hostId: string;

  @Column({ type: 'uuid' })
  guestId: string;

  @Column({ type: 'uuid' })
  visitId: string;

  @Column({ type: 'varchar', length: 24 })
  treatId: HostTreatId;

  /** The host's client key for the order (one tap): a retry finds these rows instead of serving again. */
  @Column({ type: 'varchar', length: 64 })
  orderKey: string;

  /** ₦ per serving the host paid (0 for the pantry pot). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  unitPrice: number;

  /** Game minutes. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  servedAt: number;

  /** On the table until (game minute). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  until: number;

  /** When the guest's session applied the effects (null: still to feel it). */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  appliedAt: number | null;

  /** Closeness with the host the guest gained from it (after the daily cap). */
  @Column({ type: 'smallint', default: 0 })
  closeness: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  thankedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
