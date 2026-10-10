import { createRequire } from 'node:module';

/**
 * Catches two queries running at once on one database connection (a transaction's connection: `Promise.all` over
 * `ctx.manager` queries). pg 8 only warns about it ("Calling client.query() when the client is already executing a
 * query is deprecated and will be removed in pg@9.0"), once per process; pg 9 will refuse it. The suite records every
 * place it happens and fails the file (see `bootApp`).
 */
interface PgClientProto {
  query: (...args: unknown[]) => unknown;
  __e2eGuarded?: boolean;
}

/** pg's own fields (`activeQuery` is a deprecated getter over `_activeQuery` that warns when read). */
interface PgClientState {
  readonly _activeQuery?: unknown;
  readonly _queryQueue?: readonly unknown[];
}

const sites = new Map<string, string>();

/** The first frame in our own code (backend/src) that issued the overlapping query. */
function siteOf(stack: string): string {
  const frames = stack.split('\n').slice(1).map((line) => line.trim());
  return frames.find((frame) => frame.includes('/backend/src/') && !frame.includes('/database/transaction.ts')) ?? frames[2] ?? 'unknown';
}

export function installPgConcurrencyGuard(): void {
  const require = createRequire(import.meta.url);
  const pg = require('pg') as { Client: { prototype: PgClientProto } };
  const proto = pg.Client.prototype;
  if (proto.__e2eGuarded) return;
  proto.__e2eGuarded = true;
  const original = proto.query;
  proto.query = function guardedQuery(this: PgClientState, ...args: unknown[]): unknown {
    // oxlint-disable-next-line no-underscore-dangle -- reading pg's internals is the point here
    if (this._activeQuery || (this._queryQueue?.length ?? 0) > 0) {
      const limit = Error.stackTraceLimit;
      Error.stackTraceLimit = 40;
      const stack = new Error('concurrent query').stack ?? '';
      Error.stackTraceLimit = limit;
      const site = siteOf(stack);
      if (!sites.has(site)) sites.set(site, stack);
    }
    return original.apply(this, args);
  };
}

/** Places that ran overlapping queries on one connection since the last call (and forget them). */
export function takeConcurrentQuerySites(): string[] {
  const found = [...sites.keys()];
  sites.clear();
  return found;
}
