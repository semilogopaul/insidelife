import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CareFacilityType } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

export type AdmissionStatus = 'admitted' | 'discharged' | 'left';

/** A stay on a hospital ward. While admitted the planner keeps the character at the hospital (no commute). */
@Entity('hospital_admissions')
@Index('hospital_admissions_character_status', ['characterId', 'status'])
export class HospitalAdmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 64 })
  venueId: string;

  @Column({ type: 'varchar', length: 20 })
  facility: CareFacilityType;

  /** Condition being treated (null for a delivery). */
  @Column({ type: 'uuid', nullable: true })
  conditionRecordId: string | null;

  @Column({ type: 'uuid', nullable: true })
  pregnancyId: string | null;

  @Column({ type: 'varchar', length: 120 })
  reason: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  admittedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  dischargeAt: number;

  /** Ward bill per day (₦, before HMO cover); 0 when included in a package (deliveries). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  dailyRate: number;

  @Column({ type: 'varchar', length: 12, default: 'admitted' })
  status: AdmissionStatus;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  endedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
