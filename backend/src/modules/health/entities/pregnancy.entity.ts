import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CareFacilityType } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** `self`: the character is pregnant. `partner`: the character's partner is (tracked here so both cases work). */
export type PregnancyCarrier = 'self' | 'partner';
export type PregnancyStatus = 'ongoing' | 'delivered' | 'ended';
export type DeliveryMode = 'normal' | 'c-section';

@Entity('pregnancies')
@Index('pregnancies_character_status', ['characterId', 'status'])
export class PregnancyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 8 })
  carrier: PregnancyCarrier;

  @Column({ type: 'varchar', length: 80 })
  partnerName: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  conceivedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  dueAt: number;

  @Column({ type: 'int', default: 0 })
  antenatalVisits: number;

  /** Antenatal reminders already sent (index into the schedule). */
  @Column({ type: 'int', default: 0 })
  remindersSent: number;

  /** Rolled at conception; a complication happens if it falls under the delivery-day complication chance. */
  @Column({ type: 'real' })
  riskRoll: number;

  /** An antenatal visit spotted risk factors. */
  @Column({ type: 'boolean', default: false })
  highRisk: boolean;

  @Column({ type: 'varchar', length: 20, default: 'hospital-public' })
  plannedFacility: CareFacilityType;

  @Column({ type: 'varchar', length: 64, nullable: true })
  plannedVenueId: string | null;

  @Column({ type: 'varchar', length: 12, default: 'ongoing' })
  status: PregnancyStatus;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  deliveredAt: number | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  deliveryMode: DeliveryMode | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  deliveryVenueId: string | null;

  @Column({ type: 'boolean', default: false })
  complications: boolean;

  /** The `pregnancy` condition row when the character carries the baby. */
  @Column({ type: 'uuid', nullable: true })
  conditionRecordId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
