import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { DisputeKind, DistrictId, LandTitleId, PropertyStatus, ValuePointDto } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** An omonile claim or a LASG demolition notice hanging over a plot. */
export interface PropertyDispute {
  readonly kind: DisputeKind;
  readonly stage: 'open' | 'court';
  readonly openedAt: number;
  /** Settlement the omonile want, or LASG's regularisation fee. */
  readonly demand: number;
  readonly legalFees: number;
  /** A life-event card has been dealt for it. */
  readonly raised: boolean;
  readonly courtUntil: number | null;
}

export interface PendingTitlePerfection {
  readonly to: LandTitleId;
  readonly readyAt: number;
  readonly fee: number;
}

/** A piece of land the character bought (anything built on it is a `BuildingEntity`). */
@Entity('housing_properties')
@Index('housing_properties_character_status', ['characterId', 'status'])
export class PropertyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 24 })
  districtId: DistrictId;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'int', default: 1 })
  plots: number;

  @Column({ type: 'varchar', length: 20 })
  title: LandTitleId;

  @Column({ type: 'varchar', length: 12, default: 'owned' })
  status: PropertyStatus;

  /** What was paid for the land itself. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  purchasePrice: number;

  /** Everything sunk into the property (land, fees, titles, construction) — sale gains are measured against it. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  costBasis: number;

  /** C of O-equivalent market value of the land; appreciates monthly. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  marketValue: number;

  @Column({ type: 'int', default: -1 })
  lastAppreciatedMonth: number;

  @Column({ type: 'jsonb', default: [] })
  valueHistory: ValuePointDto[];

  @Column({ type: 'jsonb', nullable: true })
  dispute: PropertyDispute | null;

  @Column({ type: 'jsonb', nullable: true })
  titlePerfection: PendingTitlePerfection | null;

  /** Unpaid Land Use Charge (+ penalty). Deducted when you sell. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  arrears: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  acquiredAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  disposedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
