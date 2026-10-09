/** Admin lists are page-numbered (tables show "page 3 of 12"). */
export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
/** CSV exports stop here; narrow the filters to export more. */
export const EXPORT_ROW_LIMIT = 50_000;

export function pageRequest(page: number | undefined, pageSize: number | undefined): PageRequest {
  return {
    page: Math.max(1, Math.floor(page ?? 1)),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE))),
  };
}

export const offsetOf = (request: PageRequest): number => (request.page - 1) * request.pageSize;

export function pageOf<T>(items: readonly T[], total: number, request: PageRequest): Page<T> {
  return { items, page: request.page, pageSize: request.pageSize, total, pageCount: Math.max(1, Math.ceil(total / request.pageSize)) };
}

/** Collects `WHERE` clauses with numbered parameters (`$1`, `$2`…) for hand-written read queries. */
export class SqlWhere {
  private readonly clauses: string[] = [];
  readonly params: unknown[] = [];

  /** Adds a parameter and returns its placeholder. */
  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  /** `build` gets `p` (adds a parameter, returns its placeholder) and returns the clause. */
  add(build: (p: (value: unknown) => string) => string): this {
    this.clauses.push(`(${build((value) => this.param(value))})`);
    return this;
  }

  /** Only adds the clause when `value` is set (not undefined, null or ''). */
  when<V>(value: V | undefined | null | '', build: (p: (value: unknown) => string, value: V) => string): this {
    if (value === undefined || value === null || value === '') return this;
    return this.add((p) => build(p, value as V));
  }

  toSql(): string {
    return this.clauses.length > 0 ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

/** `%text%` for ILIKE, with the user's own `%`, `_` and `\` matched literally. */
export function containsPattern(text: string): string {
  return `%${text.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}
