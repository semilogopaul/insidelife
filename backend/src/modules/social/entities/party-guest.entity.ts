import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** Someone who showed up (the host opening the floor is recorded too, but never counted as a guest). */
@Entity('social_party_guests')
@Index('social_party_guests_pair', ['partyId', 'characterId'], { unique: true })
export class PartyGuestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  partyId: string;

  @Index()
  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  joinedAt: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
