import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

export type NyscServiceStatus = 'serving' | 'completed' | 'exempt';

/** National Youth Service: one year as a corps member (or a certificate of exemption). */
@Entity('education_nysc_services')
@Index('education_nysc_services_character', ['characterId'], { unique: true })
export class NyscServiceEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  /** Degree that made the character eligible. */
  @Column({ type: 'uuid' })
  enrolmentId: string;

  @Column({ type: 'varchar', length: 12 })
  status: NyscServiceStatus;

  /** "LA/28B/4821". */
  @Column({ type: 'varchar', length: 16, nullable: true })
  stateCode: string | null;

  /** Place of Primary Assignment. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ppaVenueId: string | null;

  /** Monthly stipend from the PPA on top of the federal allowance. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  ppaStipend: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startsAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  endsAt: number | null;

  @Column({ type: 'int', default: 0 })
  ppaMinutesScheduled: number;

  @Column({ type: 'int', default: 0 })
  ppaMinutesAttended: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  completedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
