import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { BlueprintId, BuildingStatus, ConstructionPaymentPlan } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** One rentable unit: an NPC tenant paying annual rent upfront, or empty until `vacantUntil`. */
export interface RentalUnit {
  readonly unit: number;
  readonly tenant: string | null;
  readonly annualRent: number;
  readonly paidUntil: number | null;
  /** When an empty unit finds its next tenant (null when nobody is looking — letting is off). */
  readonly vacantUntil: number | null;
}

export interface PendingOverrun {
  readonly amount: number;
  readonly since: number;
  readonly milestone: number;
  readonly raised: boolean;
}

/** A building on a property: under construction, finished (lived in / let / vacant) or demolished. */
@Entity('housing_buildings')
@Index('housing_buildings_character', ['characterId'])
@Index('housing_buildings_property', ['propertyId'])
export class BuildingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  propertyId: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 24 })
  blueprintId: BlueprintId;

  @Column({ type: 'varchar', length: 20 })
  status: BuildingStatus;

  @Column({ type: 'varchar', length: 12 })
  paymentPlan: ConstructionPaymentPlan;

  /** Contract sum including accepted overruns. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  budget: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  costPaid: number;

  /** Working days done so far. */
  @Column({ type: 'real', default: 0 })
  progressDays: number;

  @Column({ type: 'int' })
  durationDays: number;

  @Column({ type: 'int', default: 0 })
  milestonesPaid: number;

  @Column({ type: 'int' })
  milestones: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startedAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  completedAt: number | null;

  /** Contractor stopped work waiting for a milestone payment. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  stalledSince: number | null;

  @Column({ type: 'jsonb', nullable: true })
  overrun: PendingOverrun | null;

  /** Value of the structure when in perfect condition. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  value: number;

  /** 0-100. */
  @Column({ type: 'real', default: 100 })
  condition: number;

  @Column({ type: 'boolean', default: false })
  ownerOccupied: boolean;

  /** Owner wants tenants in the free units. */
  @Column({ type: 'boolean', default: false })
  letting: boolean;

  @Column({ type: 'jsonb', default: [] })
  units: RentalUnit[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
