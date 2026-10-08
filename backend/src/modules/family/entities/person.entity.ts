import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ChildMilestoneId, ChildSchoolTier, Ethnicity, Gender, PersonTrait, WealthTier } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A non-player person in someone's life: parents, siblings, children, partners and people met around Lagos.
 * Children of two players are a single row referenced by both parents (`parentCharacterIds`).
 */
@Entity('family_people')
@Index('family_people_owner', ['ownerCharacterId'])
@Index('family_people_guardian', ['guardianCharacterId'])
export class PersonEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Character whose simulation created this person. */
  @Column({ type: 'uuid' })
  ownerCharacterId: string;

  @Column({ type: 'varchar', length: 40 })
  firstName: string;

  @Column({ type: 'varchar', length: 40 })
  lastName: string;

  @Column({ type: 'varchar', length: 8 })
  gender: Gender;

  /** Game minute of birth. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  bornAt: number;

  @Column({ type: 'varchar', length: 12 })
  ethnicity: Ethnicity;

  @Column({ type: 'jsonb', default: [] })
  traits: PersonTrait[];

  @Column({ type: 'varchar', length: 60, nullable: true })
  occupation: string | null;

  /** Monthly income (₦); a working spouse lowers household living costs. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  monthlyIncome: number;

  @Column({ type: 'varchar', length: 12, default: 'managing' })
  wealth: WealthTier;

  @Column({ type: 'boolean', default: true })
  alive: boolean;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  deceasedAt: number | null;

  /** Romantically available (not married or taken). */
  @Column({ type: 'boolean', default: true })
  available: boolean;

  /** NPC parents (e.g. a child's NPC mother, siblings' shared parents). */
  @Column({ type: 'jsonb', default: [] })
  parentPersonIds: string[];

  /** Player parents. */
  @Column({ type: 'jsonb', default: [] })
  parentCharacterIds: string[];

  /** Set when this person became a player character (an heir). */
  @Column({ type: 'uuid', nullable: true })
  characterId: string | null;

  // ----- Children ------------------------------------------------------------------------------------------------

  /** The parent who pays school fees and childcare (the birthing parent for player couples). */
  @Column({ type: 'uuid', nullable: true })
  guardianCharacterId: string | null;

  @Column({ type: 'varchar', length: 16, default: 'none' })
  schoolTier: ChildSchoolTier;

  /** 0-1, drifts toward the school tier's level; drives WAEC. */
  @Column({ type: 'real', default: 0.5 })
  schoolPerformance: number;

  /** Term index the child was sent home for unpaid fees (null when in good standing). */
  @Column({ type: 'int', nullable: true })
  sentHomeTerm: number | null;

  @Column({ type: 'jsonb', default: [] })
  milestones: ChildMilestoneId[];

  @Column({ type: 'int', nullable: true })
  waecCredits: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
