import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type FriendshipStatus = 'pending' | 'accepted';

/** Canonical key for a pair of characters, independent of who asked first (one row per pair). */
export const friendshipPairKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** A friend request (`pending`) or a friendship (`accepted`). Declined/cancelled/removed rows are deleted. */
@Entity('social_friendships')
export class FriendshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 73 })
  pairKey: string;

  @Index()
  @Column({ type: 'uuid' })
  requesterId: string;

  @Index()
  @Column({ type: 'uuid' })
  addresseeId: string;

  @Column({ type: 'varchar', length: 12 })
  status: FriendshipStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;
}
