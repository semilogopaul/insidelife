import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type UserRole = 'player' | 'admin';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Always stored lower-cased and trimmed. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'player' })
  role: UserRole;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
