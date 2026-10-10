import type { EntityManager, EntityMetadata, EntityTarget, ObjectLiteral, QueryDeepPartialEntity } from 'typeorm';

/** A column value as a comparable string; `undefined` means "not set" (TypeORM never writes undefined properties). */
function fingerprint(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return 'null';
  if (value instanceof Date) return `date:${value.getTime()}`;
  if (typeof value === 'object') return `json:${JSON.stringify(value)}`;
  return `${typeof value}:${String(value)}`;
}

/** What changed since the snapshot, and how to tell the snapshot once it is written. */
export interface RowChanges {
  /** Property name → current value, for every column that changed. */
  readonly values: Record<string, unknown>;
  readonly count: number;
  /** The changed values are in the database now: they become the snapshot's baseline. */
  written(): void;
}

/**
 * The column values of a row as it was loaded, so the transaction that holds its lock can write back only what changed
 * without reading the row again: `save()` re-selects the whole row to work out its changes, which on the character row
 * (every request) costs a wide read and a column-by-column diff. jsonb values are compared by their JSON, so changes made
 * in place (`character.needs.energy = …`) are seen. Primary, version and created/updated columns are left to the update
 * itself (version + 1, updated_at = now(), as `save()` does).
 */
export class RowSnapshot<T extends ObjectLiteral> {
  private readonly columns: readonly EntityMetadata['columns'][number][];
  private loaded: ReadonlyArray<string | undefined>;

  constructor(metadata: EntityMetadata, entity: T) {
    this.columns = metadata.columns.filter(
      (column) => column.isUpdate && !column.isPrimary && !column.isVersion && !column.isCreateDate && !column.isUpdateDate && !column.isVirtual && !column.relationMetadata,
    );
    this.loaded = this.columns.map((column) => fingerprint(column.getEntityValue(entity)));
  }

  changes(entity: T): RowChanges {
    const values: Record<string, unknown> = {};
    let count = 0;
    const current = this.columns.map((column, index) => {
      const value: unknown = column.getEntityValue(entity);
      const now = fingerprint(value);
      if (now !== undefined && now !== this.loaded[index]) {
        values[column.propertyPath] = value;
        count++;
      }
      // An unset (undefined) property isn't written, so the loaded value stays the baseline.
      return now ?? this.loaded[index];
    });
    return { values, count, written: () => (this.loaded = current) };
  }
}

/**
 * Write the entity's changed columns by primary key (`id`), like `save()` but without re-reading the row: bumps the
 * version column and `updated_at`, and copies them back onto the entity. Does nothing when nothing changed. Only for a
 * row this transaction loaded `FOR UPDATE` and has not written behind the snapshot's back.
 */
export async function updateChanged<T extends ObjectLiteral & { id: string }>(
  manager: EntityManager,
  target: EntityTarget<T>,
  entity: T,
  snapshot: RowSnapshot<T>,
): Promise<void> {
  const changes = snapshot.changes(entity);
  if (changes.count === 0) return;
  const metadata = manager.connection.getMetadata(target);
  const returning = [metadata.updateDateColumn, metadata.versionColumn].filter((column) => column !== undefined);
  const result = await manager
    .createQueryBuilder()
    .update(target)
    .set(changes.values as QueryDeepPartialEntity<T>)
    .where('id = :id', { id: entity.id })
    .returning(returning.map((column) => column.propertyPath))
    .execute();
  const row = (result.raw as Array<Record<string, unknown>>)[0];
  if (row) for (const column of returning) column.setEntityValue(entity, row[column.databaseName]);
  changes.written();
}
