import type { DistrictId, VisitStatus } from '@insidelife/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** The host's home as captured when the invite was sent (what the guest sees inside). */
export interface VisitHomeSnapshot {
  readonly label: string;
  readonly districtId: DistrictId;
  readonly ownership: 'family' | 'rented' | 'owned' | 'hostel';
  readonly comfort: number;
  readonly items: readonly string[];
}

/** One invite to someone's home, and the visit once accepted. */
@Entity('home_visits')
@Index('home_visits_host_status', ['hostId', 'status'])
@Index('home_visits_guest_status', ['guestId', 'status'])
export class HomeVisitEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  hostId: string;

  @Column({ type: 'uuid' })
  guestId: string;

  @Column({ type: 'varchar', length: 12 })
  status: VisitStatus;

  @Column({ type: 'jsonb' })
  home: VisitHomeSnapshot;

  /** Game minutes. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  invitedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  expiresAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  respondedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
