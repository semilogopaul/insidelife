import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { PartyDressCode, PartyTierId, PartyVenueKind } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** `ended` is set when the host's simulation passes `endsAt` (host clout is awarded then). */
export type PartyStatus = 'scheduled' | 'ended' | 'cancelled';

@Entity('social_parties')
@Index('social_parties_status_ends', ['status', 'endsAt'])
@Index('social_parties_host_status', ['hostId', 'status'])
export class PartyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  hostId: string;

  /** Catalog venue id, or `home:<hostId>`. */
  @Column({ type: 'varchar', length: 64 })
  venueId: string;

  @Column({ type: 'varchar', length: 16 })
  venueKind: PartyVenueKind;

  @Column({ type: 'varchar', length: 24 })
  districtId: string;

  @Column({ type: 'varchar', length: 60 })
  title: string;

  @Column({ type: 'varchar', length: 16 })
  tier: PartyTierId;

  @Column({ type: 'varchar', length: 20 })
  dressCode: PartyDressCode;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startsAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  endsAt: number;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  costPaid: number;

  @Column({ type: 'varchar', length: 12, default: 'scheduled' })
  status: PartyStatus;

  /** Guests excluding the host (atomic increments). */
  @Column({ type: 'int', default: 0 })
  guestCount: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  totalSprayed: number;

  @Column({ type: 'int', default: 0 })
  hostClout: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
