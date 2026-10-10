import { describe, expect, it, vi } from 'vitest';
import { migrate } from './migrate.js';

function fakeSource(overrides: Record<string, unknown> = {}) {
  const source = {
    isInitialized: false,
    initialize: vi.fn(async () => {
      source.isInitialized = true;
    }),
    runMigrations: vi.fn(async () => [{ name: 'Init1' }, { name: 'Next2' }]),
    destroy: vi.fn(async () => {
      source.isInitialized = false;
    }),
    ...overrides,
  };
  return source;
}

describe('migrate (run-and-exit entry point)', () => {
  it('applies pending migrations in one transaction, closes the connection and returns 0', async () => {
    const source = fakeSource();
    const lines: string[] = [];
    await expect(migrate(source as never, (line) => lines.push(line))).resolves.toBe(0);
    expect(source.runMigrations).toHaveBeenCalledWith({ transaction: 'all' });
    expect(source.destroy).toHaveBeenCalledOnce();
    expect(lines.join('\n')).toContain('Applied 2 migration(s): Init1, Next2');
  });

  it('returns 0 when there is nothing to run', async () => {
    const source = fakeSource({ runMigrations: vi.fn(async () => []) });
    const lines: string[] = [];
    await expect(migrate(source as never, (line) => lines.push(line))).resolves.toBe(0);
    expect(lines[0]).toContain('up to date');
  });

  it('returns 1 and still closes the connection when a migration fails', async () => {
    const source = fakeSource({
      runMigrations: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const lines: string[] = [];
    await expect(migrate(source as never, (line) => lines.push(line))).resolves.toBe(1);
    expect(source.destroy).toHaveBeenCalledOnce();
    expect(lines.join('\n')).toContain('boom');
  });

  it('returns 1 when the database cannot be reached', async () => {
    const source = fakeSource({
      initialize: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    });
    await expect(migrate(source as never, () => undefined)).resolves.toBe(1);
    expect(source.runMigrations).not.toHaveBeenCalled();
  });
});
