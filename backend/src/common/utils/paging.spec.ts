import { describe, expect, it } from 'vitest';
import { SqlWhere, containsPattern, offsetOf, pageOf, pageRequest } from './paging.js';

describe('paging', () => {
  it('clamps page and size', () => {
    expect(pageRequest(undefined, undefined)).toEqual({ page: 1, pageSize: 25 });
    expect(pageRequest(0, 1000)).toEqual({ page: 1, pageSize: 100 });
    expect(offsetOf(pageRequest(3, 20))).toBe(40);
  });

  it('reports the page count', () => {
    expect(pageOf(['a'], 51, { page: 2, pageSize: 25 })).toMatchObject({ total: 51, pageCount: 3, page: 2 });
    expect(pageOf([], 0, { page: 1, pageSize: 25 }).pageCount).toBe(1);
  });

  it('numbers parameters in order and skips empty filters', () => {
    const where = new SqlWhere()
      .when('tolu', (p, q) => `handle ILIKE ${p(containsPattern(q))} OR email ILIKE ${p(containsPattern(q))}`)
      .when('', (p, value) => `status = ${p(value)}`)
      .when(undefined, (p, value) => `x = ${p(value)}`)
      .add((p) => `created_at >= ${p('2026-10-01')}`);
    expect(where.toSql()).toBe('WHERE (handle ILIKE $1 OR email ILIKE $2) AND (created_at >= $3)');
    expect(where.params).toEqual(['%tolu%', '%tolu%', '2026-10-01']);
    expect(new SqlWhere().toSql()).toBe('');
  });

  it('matches wildcards literally', () => {
    expect(containsPattern(' 50%_off\\ ')).toBe('%50\\%\\_off\\\\%');
  });
});
