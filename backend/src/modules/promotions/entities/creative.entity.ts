import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { BillboardFormat } from '@insidelife/shared';

/** A processed billboard image (WebP at the format's exact size), owned by the uploader until used in campaigns. */
@Entity('promotion_creatives')
@Index('promotion_creatives_owner_created', ['ownerUserId', 'createdAt'])
@Index('promotion_creatives_key', ['key'], { unique: true })
export class CreativeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'varchar', length: 16 })
  format: BillboardFormat;

  @Column({ type: 'smallint' })
  width: number;

  @Column({ type: 'smallint' })
  height: number;

  /** Object key in the media bucket (random UUID path). */
  @Column({ type: 'varchar', length: 200 })
  key: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'integer' })
  bytes: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
