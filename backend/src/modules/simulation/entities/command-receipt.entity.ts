import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * The stored result of a "tap once" command (a purchase sent with a client idempotency key): a retry with the same
 * key gets this response back instead of buying again. Written in the command's own transaction, so it exists only
 * if the command committed. Old receipts are pruned when the character makes new ones.
 */
@Entity('command_receipts')
@Index('command_receipts_key', ['characterId', 'kind', 'key'], { unique: true })
export class CommandReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  /** Which command (e.g. `shop-purchase`), so one key can't answer for a different command. */
  @Column({ type: 'varchar', length: 40 })
  kind: string;

  @Column({ type: 'varchar', length: 64 })
  key: string;

  /** What was asked for; a retry asking for something else with the same key is refused. */
  @Column({ type: 'jsonb' })
  request: unknown;

  @Column({ type: 'jsonb' })
  response: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
