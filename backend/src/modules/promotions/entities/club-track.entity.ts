import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { TrackContentType } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** An uploaded song. Rotation is bought per order (ClubPlayOrderEntity); a track has at most one open order. */
@Entity('promotion_tracks')
@Index('promotion_tracks_owner_created', ['ownerUserId', 'createdAt'])
export class ClubTrackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'uuid', nullable: true })
  ownerCharacterId: string | null;

  @Column({ type: 'varchar', length: 40 })
  artistName: string;

  @Column({ type: 'varchar', length: 80 })
  title: string;

  @Column({ type: 'varchar', length: 200 })
  audioKey: string;

  @Column({ type: 'varchar', length: 500 })
  audioUrl: string;

  @Column({ type: 'varchar', length: 16 })
  contentType: TrackContentType;

  @Column({ type: 'smallint' })
  durationSeconds: number;

  @Column({ type: 'integer' })
  bytes: number;

  /** Set when a moderator rejected it and the audio was deleted; the track can't be ordered again. */
  @Column({ type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  /** Lifetime plays across orders. */
  @Column({ type: 'bigint', transformer: bigintNumber, default: 0 })
  plays: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
