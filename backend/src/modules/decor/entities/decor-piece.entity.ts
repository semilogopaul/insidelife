import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { DecorWall } from '@insidelife/shared';
import { bigintNumber, decimalNumber } from '../../../database/transformers.js';

/**
 * One piece of decor a character owns. While `templateId` is null it sits in their inventory; otherwise it stands in
 * `roomId` of a home template at (`x`, `z`) (wall pieces: on `wall`, at height `y`; tabletop pieces: on `onId` at the
 * surface height `y`). `homeKey` says which home it was put in (`homeKey(characterId, homePropertyId)`), so moving to
 * another house puts the pieces away.
 */
@Entity('decor_pieces')
@Index('decor_pieces_character', ['characterId'])
@Index('decor_pieces_room', ['characterId', 'homeKey', 'templateId', 'roomId'])
@Index('decor_pieces_home', ['homeKey'], { where: '"template_id" IS NOT NULL' })
export class DecorPieceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  /** Catalog id (`DECOR_ITEMS`). */
  @Column({ type: 'varchar', length: 40 })
  itemId: string;

  @Column({ type: 'varchar', length: 24 })
  variant: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  pricePaid: number;

  /** Game minute it was bought. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  boughtAt: number;

  @Column({ type: 'smallint', default: 0 })
  recolours: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  homeKey: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  templateId: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  roomId: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalNumber })
  x: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalNumber })
  y: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalNumber })
  z: number;

  /** Degrees about +Y, 0-359. */
  @Column({ type: 'smallint', default: 0 })
  rot: number;

  @Column({ type: 'varchar', length: 8, nullable: true })
  wall: DecorWall | null;

  /** Tabletop pieces: the piece they sit on. */
  @Column({ type: 'uuid', nullable: true })
  onId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
