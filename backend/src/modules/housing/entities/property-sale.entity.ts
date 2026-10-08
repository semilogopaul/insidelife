import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

export type PropertySaleStatus = 'listed' | 'sold' | 'cancelled' | 'fell-through';

/** A property listed with an estate agent; closes after 1-3 game months at the valuation ± noise. */
@Entity('housing_property_sales')
@Index('housing_property_sales_character_status', ['characterId', 'status'])
export class PropertySaleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'uuid' })
  propertyId: string;

  @Column({ type: 'varchar', length: 16, default: 'listed' })
  status: PropertySaleStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  listedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  closesAt: number;

  /** Valuation when listed. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  askingPrice: number;

  @Column({ type: 'real' })
  agentRate: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  salePrice: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  proceeds: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  closedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
