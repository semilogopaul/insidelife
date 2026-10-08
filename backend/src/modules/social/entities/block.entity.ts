import { CreateDateColumn, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** `blockerId` doesn't want to hear from `blockedId`. Checked in both directions (see SocialGuard). */
@Entity('social_blocks')
@Index('social_blocks_pair', ['blockerId', 'blockedId'], { unique: true })
export class BlockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  blockerId: string;

  @Index()
  @Column({ type: 'uuid' })
  blockedId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
