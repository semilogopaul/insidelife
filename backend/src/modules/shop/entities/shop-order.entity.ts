import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ShopChannel, ShopOrderStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';
import type { InventoryKind } from './inventory-item.entity.js';

/**
 * Every purchase is an order: in-store orders are delivered on the spot, online orders stay `pending` until the
 * dispatch rider arrives (delivered by the shop system at day end). The order id is the ledger idempotency key.
 */
@Entity('shop_orders')
@Index('shop_orders_character_status', ['characterId', 'status'])
export class ShopOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 64 })
  itemId: string;

  @Column({ type: 'varchar', length: 12 })
  kind: InventoryKind;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  unitPrice: number;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  deliveryFee: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  total: number;

  @Column({ type: 'varchar', length: 10 })
  channel: ShopChannel;

  @Column({ type: 'varchar', length: 64, nullable: true })
  venueId: string | null;

  @Column({ type: 'varchar', length: 12 })
  status: ShopOrderStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  orderedAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  arrivesAt: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  deliveredAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
