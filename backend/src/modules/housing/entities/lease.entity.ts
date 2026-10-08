import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { DistrictId, HousingTypeId, LeaseStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

export type LeaseEndReason = 'moved' | 'tenant-notice' | 'landlord-notice' | 'evicted' | 'deceased';

/** Card-state for the landlord's renewal drama (which life events have been raised). */
export interface LeaseFlags {
  readonly increaseRaised?: boolean;
  readonly twoYearsDemand?: boolean;
  readonly twoYearsRaised?: boolean;
}

/** A tenancy agreement with a snapshot of the listing that was rented. */
@Entity('housing_leases')
@Index('housing_leases_character_status', ['characterId', 'status'])
export class LeaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 64 })
  listingId: string;

  @Column({ type: 'varchar', length: 24 })
  districtId: DistrictId;

  @Column({ type: 'varchar', length: 16 })
  typeId: HousingTypeId;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'jsonb', default: [] })
  features: string[];

  @Column({ type: 'bigint', transformer: bigintNumber })
  annualRent: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  serviceCharge: number;

  /** Refundable deposit held by the landlord. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  cautionDeposit: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startAt: number;

  /** When the current paid term ends. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  endAt: number;

  @Column({ type: 'varchar', length: 12 })
  status: LeaseStatus;

  /** Landlord's increase for the next term (fraction), decided ~30 days before `endAt`. */
  @Column({ type: 'real', default: 0 })
  pendingIncrease: number;

  /** `endAt` of the term whose renewal terms were decided (so we decide once per term). */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  renewalDecidedFor: number | null;

  @Column({ type: 'int', default: 1 })
  renewalYears: number;

  @Column({ type: 'boolean', default: false })
  nonRenewing: boolean;

  @Column({ type: 'varchar', length: 16, nullable: true })
  nonRenewingReason: 'tenant' | 'landlord' | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  graceUntil: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  evictAt: number | null;

  @Column({ type: 'jsonb', default: {} })
  flags: LeaseFlags;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  endedAt: number | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  endReason: LeaseEndReason | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
