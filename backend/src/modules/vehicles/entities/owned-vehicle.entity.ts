import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { OwnedVehicleStatus, VehiclePaintId } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A car a character owns (or has bought and is waiting on). Condition wears linearly per day from `condition` at
 * `conditionAt` (closed form); mileage, skipped services, events and repairs reset the anchor.
 */
@Entity('owned_vehicles')
export class OwnedVehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('owned_vehicles_character')
  @Column({ type: 'uuid' })
  characterId: string;

  /** Catalog id (VEHICLES). */
  @Column({ type: 'varchar', length: 64 })
  vehicleId: string;

  @Column({ type: 'varchar', length: 24 })
  paint: VehiclePaintId;

  @Column({ type: 'varchar', length: 12 })
  plate: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  purchasePrice: number;

  /** 0-100 as of `conditionAt`. */
  @Column({ type: 'real' })
  condition: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  conditionAt: number;

  @Column({ type: 'real', default: 0 })
  mileageKm: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  acquiredAt: number;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'varchar', length: 12, default: 'owned' })
  status: OwnedVehicleStatus;

  /** Remote purchases: delivery time. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  arrivesAt: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  lastDrivenAt: number | null;

  /** Consecutive month-end services the owner couldn't pay for. */
  @Column({ type: 'int', default: 0 })
  skippedServices: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
