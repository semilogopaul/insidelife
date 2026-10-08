import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** A licence or certificate the character holds (Bar, ICAN, cloud, IELTS, driver's licence…). */
@Entity('education_certifications')
@Index('education_certifications_character_code', ['characterId', 'code'], { unique: true })
export class CertificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 32 })
  code: string;

  /** IELTS band for scored exams. */
  @Column({ type: 'real', nullable: true })
  score: number | null;

  /** Programme that granted it, or `external` (another domain). */
  @Column({ type: 'varchar', length: 32 })
  source: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  grantedAt: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
