import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { DistrictId, HomeOwnership } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * Where a character lives right now (one row per character). The family house is always there to fall back to;
 * a rented flat points at a lease, an owned house at a building.
 */
@Entity('housing_residences')
export class ResidenceEntity {
  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 8 })
  kind: HomeOwnership;

  @Column({ type: 'uuid', nullable: true })
  leaseId: string | null;

  @Column({ type: 'uuid', nullable: true })
  buildingId: string | null;

  /** Where the family house is (moving back home lands you here). */
  @Column({ type: 'varchar', length: 24 })
  familyDistrictId: DistrictId;

  /** Comfort of the family house (from the birth-lottery background). */
  @Column({ type: 'int', default: 0 })
  familyComfort: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  movedInAt: number;

  /** Game day on which the generator had no fuel (blackout penalty applies). */
  @Column({ type: 'int', nullable: true })
  generatorDryDay: number | null;

  /** Last game day the home's street flooded. */
  @Column({ type: 'int', nullable: true })
  lastFloodDay: number | null;

  /** Street vigilante paid until this game minute (no burglaries meanwhile). */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  securityUntil: number | null;

  /** How many "time to move out" hints the family has dropped. */
  @Column({ type: 'int', default: 0 })
  familyHints: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
