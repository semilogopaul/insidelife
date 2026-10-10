import type { EntityManager } from 'typeorm';

/**
 * A cheap "does this character have any rows here?" check for a per-character load that runs on (nearly) every settle
 * and usually finds nothing (no NYSC posting, no car, no lease, no open bet…). The owning domain declares it next to the
 * load it guards and lists it in its system's `rowProbes`; every probe of a session is answered by one query.
 */
export interface RowProbe {
  /** Unique, e.g. `vehicles:owned`. */
  readonly key: string;
  /** The table the guarded load reads (any write in the session that names it voids the answer). */
  readonly table: string;
  /**
   * SQL condition on `table`, `$1` being the character id. It must hold for every row the guarded load could return
   * (the same filter or a looser one): when no row matches, the load is skipped and its empty answer used instead.
   */
  readonly where: string;
}

/** Where the session's presence lives on its query runner (`QueryRunner.data`), for `RowPresenceSubscriber`. */
export const ROW_PRESENCE = 'insidelife:row-presence';

/** Statements that never add rows to a table. Anything else (INSERT, UPDATE, DELETE, WITH …, DO …) counts as a write. */
const READ_ONLY = /^\s*(SELECT|SHOW|START TRANSACTION|SET TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/**
 * Which probed tables have rows for the session's character: asked lazily (one query, the first time a guarded load
 * runs) inside the session's transaction, while it holds the character's row lock. Rows written later in the same
 * transaction are seen because every write is reported here (`noteQuery`): a write that names a table makes its probes
 * "maybe" again, so the guarded load runs. Rows other players commit between the probe and the load are picked up by the
 * next settle, exactly as if this request had arrived a moment earlier.
 */
export class RowPresence {
  private known: Map<string, boolean> | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly manager: EntityManager,
    private readonly characterId: string,
    private readonly probes: readonly RowProbe[],
  ) {}

  /** False only when no row can match `probe` right now (the guarded load would come back empty). */
  async mayHave(probe: RowProbe): Promise<boolean> {
    if (!this.probes.includes(probe)) return true;
    if (!this.known) await (this.loading ??= this.load());
    return this.known?.get(probe.key) !== false;
  }

  /** Every statement the session's transaction runs: a write naming a probed table voids what is known about it. */
  noteQuery(sql: string): void {
    if (!this.known || READ_ONLY.test(sql)) return;
    for (const probe of this.probes) if (this.known.get(probe.key) === false && sql.includes(probe.table)) this.known.set(probe.key, true);
  }

  private async load(): Promise<void> {
    try {
      const columns = this.probes.map((probe, index) => `EXISTS (SELECT 1 FROM ${probe.table} WHERE ${probe.where}) AS p${index}`);
      const rows = (await this.manager.query(`SELECT ${columns.join(', ')}`, [this.characterId])) as Array<Record<string, boolean>>;
      const row = rows[0] ?? {};
      this.known = new Map(this.probes.map((probe, index) => [probe.key, row[`p${index}`] !== false]));
    } finally {
      this.loading = null;
    }
  }
}
