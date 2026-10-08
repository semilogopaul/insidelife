/**
 * `EntityManager.query` returns `[rows, affected]` for UPDATE/DELETE … RETURNING on Postgres and plain rows for
 * SELECT. Normalise to rows.
 */
export function returnedRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}
