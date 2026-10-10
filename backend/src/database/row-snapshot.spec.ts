import { Column, DataSource, Entity, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn, type EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RowSnapshot, updateChanged } from './row-snapshot.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';
import { bigintNumber } from './transformers.js';

@Entity('things')
class ThingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'jsonb' })
  needs: { energy: number; hunger: number };

  @Column({ type: 'bigint', transformer: bigintNumber })
  settledAt: number;

  @Column({ type: 'timestamptz', nullable: true })
  seenAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}

const dataSource = new DataSource({ type: 'postgres', entities: [ThingEntity], namingStrategy: new SnakeNamingStrategy() });
// Metadata only (no connection), the way the app names columns (snake_case).
await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
const metadata = dataSource.getMetadata(ThingEntity);

function thing(): ThingEntity {
  return Object.assign(new ThingEntity(), {
    id: 't1',
    name: 'Ada',
    needs: { energy: 50, hunger: 60 },
    settledAt: 100,
    seenAt: new Date('2026-10-10T10:00:00Z'),
    updatedAt: new Date('2026-10-10T09:00:00Z'),
    version: 3,
  });
}

describe('RowSnapshot', () => {
  it('finds nothing to write for an untouched row (version and updated_at are not columns to diff)', () => {
    const row = thing();
    const snapshot = new RowSnapshot(metadata, row);
    row.version = 99;
    row.updatedAt = new Date();
    expect(snapshot.changes(row).count).toBe(0);
  });

  it('sees plain assignments, in-place jsonb edits and new dates, but not an equal date or an unset property', () => {
    const row = thing();
    const snapshot = new RowSnapshot(metadata, row);
    row.settledAt = 115;
    row.needs.energy = 42; // mutated in place, as the engine does
    row.seenAt = new Date('2026-10-10T10:00:00Z'); // same instant, new object
    (row as { name?: string }).name = undefined; // TypeORM never writes undefined
    const changes = snapshot.changes(row);
    expect(changes.values).toEqual({ settledAt: 115, needs: { energy: 42, hunger: 60 } });
    expect(changes.count).toBe(2);
  });

  it('takes the written values as its new baseline', () => {
    const row = thing();
    const snapshot = new RowSnapshot(metadata, row);
    row.settledAt = 120;
    snapshot.changes(row).written();
    expect(snapshot.changes(row).count).toBe(0);
    row.seenAt = null;
    expect(snapshot.changes(row).values).toEqual({ seenAt: null });
  });
});

describe('updateChanged', () => {
  function fakeManager(raw: unknown[]) {
    const calls: { set?: unknown; where?: unknown; returning?: unknown } = {};
    const builder = {
      update: () => builder,
      set: (values: unknown) => ((calls.set = values), builder),
      where: (sql: string, params: unknown) => ((calls.where = [sql, params]), builder),
      returning: (columns: unknown) => ((calls.returning = columns), builder),
      execute: vi.fn(async () => ({ raw })),
    };
    const manager = { connection: dataSource, createQueryBuilder: () => builder } as unknown as EntityManager;
    return { manager, calls, builder };
  }

  it('does nothing when nothing changed', async () => {
    const row = thing();
    const { manager, builder } = fakeManager([]);
    await updateChanged(manager, ThingEntity, row, new RowSnapshot(metadata, row));
    expect(builder.execute).not.toHaveBeenCalled();
  });

  it('updates only the changed columns by id and copies the new version and updated_at back', async () => {
    const row = thing();
    const snapshot = new RowSnapshot(metadata, row);
    row.settledAt = 130;
    const updatedAt = new Date('2026-10-10T11:00:00Z');
    const { manager, calls } = fakeManager([{ updated_at: updatedAt, version: 4 }]);
    await updateChanged(manager, ThingEntity, row, snapshot);
    expect(calls.set).toEqual({ settledAt: 130 });
    expect(calls.where).toEqual(['id = :id', { id: 't1' }]);
    expect(calls.returning).toEqual(['updatedAt', 'version']);
    expect(row.version).toBe(4);
    expect(row.updatedAt).toBe(updatedAt);
    expect(snapshot.changes(row).count).toBe(0);
  });
});
