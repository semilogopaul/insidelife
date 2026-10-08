import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { InteractionType, RelationshipKind } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** Who ended a relationship (for the ex's side of the story). */
export type EndedBy = 'me' | 'them' | 'death';

/** Milestones and bookkeeping of one relationship. */
export interface RelationshipFlags {
  readonly datingSince?: number;
  readonly engagedAt?: number;
  readonly ringValue?: number;
  readonly introductionDone?: boolean;
  readonly traditionalDone?: boolean;
  readonly whiteWeddingDone?: boolean;
  /** NPC partner's due date. */
  readonly pregnancyDueAt?: number;
  /** NPC partner relocated abroad until this game minute (long distance). */
  readonly abroadUntil?: number;
  readonly endedBy?: EndedBy;
  /** Interaction type → game minute it is available again. */
  readonly cooldowns?: Readonly<Partial<Record<InteractionType, number>>>;
  /** Interaction type → attempts so far (keys deterministic rolls, so spamming never rerolls). */
  readonly attempts?: Readonly<Partial<Record<InteractionType, number>>>;
}

/**
 * One character's relationship with a person (NPC) or another player. Closeness and romance are stored as of
 * `lastContactAt` / `lastRomanceAt` and decay in closed form (see `closeness.rules.ts`), so idle days cost no writes.
 * Player-to-player links are two rows, one owned by each player; each player's session only writes its own row.
 */
@Entity('family_relationships')
@Index('family_relationships_character', ['characterId', 'kind'])
@Index('family_relationships_person', ['characterId', 'personId'], { unique: true, where: '"person_id" IS NOT NULL' })
@Index('family_relationships_player', ['characterId', 'otherCharacterId'], { unique: true, where: '"other_character_id" IS NOT NULL' })
@Index('family_relationships_other', ['otherCharacterId'])
export class RelationshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'uuid', nullable: true })
  personId: string | null;

  @Column({ type: 'uuid', nullable: true })
  otherCharacterId: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind: RelationshipKind;

  @Column({ type: 'real', default: 0 })
  closeness: number;

  @Column({ type: 'real', default: 0 })
  romance: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  since: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  lastContactAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  lastRomanceAt: number;

  /** Venue id, or `family` / `online` / `arranged` / `owambe`. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  metAt: string | null;

  @Column({ type: 'jsonb', default: {} })
  flags: RelationshipFlags;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
