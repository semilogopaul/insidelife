import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { InventorySource } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

export type InventoryKind = 'item' | 'clothing';

/**
 * A stack of one catalog product (item or clothing) a character owns. Condition wears linearly from
 * `condition` at `conditionAt` (closed form, no daily writes); repairs and events reset both.
 */
@Entity('inventory_items')
@Index('inventory_items_character_item', ['characterId', 'itemId'])
export class InventoryItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('inventory_items_character')
  @Column({ type: 'uuid' })
  characterId: string;

  /** Catalog id (ITEMS or CLOTHING). */
  @Column({ type: 'varchar', length: 64 })
  itemId: string;

  @Column({ type: 'varchar', length: 12 })
  kind: InventoryKind;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** 0-100 as of `conditionAt`. */
  @Column({ type: 'real', default: 100 })
  condition: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  conditionAt: number;

  /** Game minute the stack was first acquired. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  acquiredAt: number;

  @Column({ type: 'varchar', length: 12 })
  source: InventorySource;

  /** Unit price last paid (0 for gifts and starter kit). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  unitPrice: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
