import { Injectable } from '@nestjs/common';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { ProgressionCounterEntity } from '../entities/progression-counter.entity.js';
import { aggregateDeltasForFlags } from '../progression.rules.js';

/** Characters whose persisted flags we remember in-process (bounded; it's only an optimisation). */
const KNOWN_FLAGS_CAPACITY = 20_000;

/**
 * Per-character tallies and flags (`action:eat-buka`, `trip:danfo`, `venue:cbt-yaba`, `outside`…).
 *
 * - Increments are one multi-row upsert, so an action completion costs a single statement.
 * - Flags are idempotent first-time markers. Presence is reported on every simulated segment, so flags already known
 *   to be persisted are skipped in memory; inserts are `ON CONFLICT DO NOTHING`, so a stale cache is harmless.
 * - Values loaded for a transaction are cached per `SimulationContext` and kept in sync with our own writes.
 */
@Injectable()
export class CountersService {
  private readonly loaded = new WeakMap<SimulationContext, Map<string, number>>();
  private readonly knownFlags = new Map<string, Set<string>>();

  async load(ctx: SimulationContext): Promise<ReadonlyMap<string, number>> {
    const cached = this.loaded.get(ctx);
    if (cached) return cached;
    const rows = await ctx.manager.find(ProgressionCounterEntity, {
      where: { characterId: ctx.character.id },
      select: { key: true, value: true },
    });
    const values = new Map(rows.map((row) => [row.key, row.value]));
    this.loaded.set(ctx, values);
    return values;
  }

  /** Add deltas (one statement); returns the keys that changed. */
  async increment(ctx: SimulationContext, deltas: ReadonlyMap<string, number>): Promise<string[]> {
    const entries = [...deltas].filter(([, delta]) => Number.isFinite(delta) && delta !== 0);
    if (entries.length === 0) return [];
    const rows = (await ctx.manager.query(
      `INSERT INTO progression_counters (character_id, key, value, updated_at)
       SELECT $1, t.key, t.value, now() FROM unnest($2::varchar[], $3::bigint[]) AS t(key, value)
       ON CONFLICT (character_id, key)
       DO UPDATE SET value = progression_counters.value + EXCLUDED.value, updated_at = now()
       RETURNING key, value`,
      [ctx.character.id, entries.map(([key]) => key), entries.map(([, delta]) => Math.round(delta))],
    )) as ReadonlyArray<{ readonly key: string; readonly value: string | number }>;
    const values = this.loaded.get(ctx);
    if (values) for (const row of rows) values.set(row.key, Number(row.value));
    return entries.map(([key]) => key);
  }

  /**
   * Set first-time flags. Newly set flags also bump their distinct counters (`venues`, `venue-type:<type>`,
   * `districts`, `cities`). Returns every counter key that changed.
   */
  async markFlags(ctx: SimulationContext, flags: readonly string[]): Promise<string[]> {
    const characterId = ctx.character.id;
    const known = this.knownFlags.get(characterId);
    const unknown = [...new Set(flags)].filter((flag) => !known?.has(flag));
    if (unknown.length === 0) return [];

    const rows = (await ctx.manager.query(
      `INSERT INTO progression_counters (character_id, key, value, updated_at)
       SELECT $1, flag, 1, now() FROM unnest($2::varchar[]) AS flag
       ON CONFLICT (character_id, key) DO NOTHING
       RETURNING key`,
      [characterId, unknown],
    )) as ReadonlyArray<{ readonly key: string }>;
    const inserted = rows.map((row) => row.key);
    const values = this.loaded.get(ctx);
    if (values) for (const key of inserted) values.set(key, 1);

    const aggregated = await this.increment(ctx, aggregateDeltasForFlags(inserted));
    ctx.afterCommit(() => this.remember(characterId, unknown));
    return [...inserted, ...aggregated];
  }

  private remember(characterId: string, flags: readonly string[]): void {
    let known = this.knownFlags.get(characterId);
    if (!known) {
      if (this.knownFlags.size >= KNOWN_FLAGS_CAPACITY) {
        const oldest = this.knownFlags.keys().next();
        if (!oldest.done) this.knownFlags.delete(oldest.value);
      }
      known = new Set();
      this.knownFlags.set(characterId, known);
    }
    for (const flag of flags) known.add(flag);
  }
}
