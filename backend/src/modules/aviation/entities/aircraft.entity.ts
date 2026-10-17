import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * An aircraft a character owns. Parked at `parkedAt` (a General Aviation Terminal venue id) once `arrivesAt` has passed;
 * until then it is on its ferry flight or in the air to `parkedAt`. The registration is globally unique.
 */
@Entity('aircraft')
export class AircraftEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('aircraft_character')
  @Column({ type: 'uuid' })
  characterId: string;

  /** Catalog id (AIRCRAFT). */
  @Column({ type: 'varchar', length: 40 })
  aircraftId: string;

  /** The name painted on the fuselage (upper-case), or null. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  callName: string | null;

  /** `5N-XXX`, unique across the world. */
  @Index('aircraft_registration', { unique: true })
  @Column({ type: 'varchar', length: 8 })
  registration: string;

  @Column({ type: 'varchar', length: 24 })
  liveryBase: string;

  @Column({ type: 'varchar', length: 24 })
  liveryAccent: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  purchasePrice: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  acquiredAt: number;

  /** GAT venue id where it is parked (or heading). */
  @Column({ type: 'varchar', length: 24 })
  parkedAt: string;

  /** Ferry or flight in progress until this game minute. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  arrivesAt: number | null;

  /** Game minute the aircraft was grounded for unpaid bills; null while it may fly. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  groundedAt: number | null;

  /** Unpaid month-end bills (cleared by reinstating the aircraft, or out of a sale). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  arrears: number;

  /** How many times it has been reinstated; keys the reinstatement payments. */
  @Column({ type: 'int', default: 0 })
  reinstatements: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
