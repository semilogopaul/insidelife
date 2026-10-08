import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { BusinessStatus, DistrictId } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A business the character owns (or owned: sold, closed or folded rows stay for history). */
@Entity('businesses')
@Index('businesses_character_status', ['characterId', 'status'])
export class BusinessEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 32 })
  typeId: string;

  @Column({ type: 'varchar', length: 40 })
  name: string;

  @Column({ type: 'varchar', length: 24 })
  districtId: DistrictId;

  /** Kiosks, buses, branches… */
  @Column({ type: 'int', default: 1 })
  units: number;

  /** Capital paid in so far (start-up + expansions), in naira at the prices paid. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  investedCapital: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  openedAt: number;

  @Column({ type: 'varchar', length: 8, default: 'active' })
  status: BusinessStatus;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  closedAt: number | null;

  /** Supplier credit the business is carrying after months the owner couldn't cover. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  debt: number;

  /** Hands-on management this month (`manage-business` action). */
  @Column({ type: 'int', default: 0 })
  managementMinutesMonth: number;

  @Column({ type: 'int', default: 0 })
  consecutiveLosses: number;

  /** Startup traction (1 = launch). */
  @Column({ type: 'real', default: 1 })
  traction: number;

  /** Revenue multiplier from this month's life events. */
  @Column({ type: 'real', default: 1 })
  eventModifier: number;

  /** When this business last drew a life-event card (throttles how often trouble finds one business). */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  lastEventAt: number | null;

  /** One-off costs from this month's life events. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  eventCosts: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
