import { describe, expect, it } from 'vitest';
import { resolvePostgresConnection } from './connection-options.js';

describe('resolvePostgresConnection', () => {
  it('has no TLS by default (local docker Postgres)', () => {
    expect(resolvePostgresConnection('postgres://u:p@localhost:55432/db')).toMatchObject({ ssl: false, mode: 'disable' });
  });

  it('turns ?sslmode=require into verified TLS and strips it from the URL', () => {
    const result = resolvePostgresConnection('postgres://u:p%40x@srv.postgres.database.azure.com:6432/insidelife?sslmode=require');
    expect(result.ssl).toEqual({ rejectUnauthorized: true });
    expect(result.url).toBe('postgres://u:p%40x@srv.postgres.database.azure.com:6432/insidelife');
  });

  it('treats verify-ca / verify-full as verified TLS and prefer / allow / disable as off', () => {
    expect(resolvePostgresConnection('postgres://h/db?sslmode=verify-full').ssl).toEqual({ rejectUnauthorized: true });
    expect(resolvePostgresConnection('postgres://h/db?sslmode=verify-ca').ssl).toEqual({ rejectUnauthorized: true });
    expect(resolvePostgresConnection('postgres://h/db?sslmode=prefer').ssl).toBe(false);
    expect(resolvePostgresConnection('postgres://h/db?sslmode=disable').ssl).toBe(false);
  });

  it('supports ssl=true and no-verify', () => {
    expect(resolvePostgresConnection('postgres://h/db?ssl=true').ssl).toEqual({ rejectUnauthorized: true });
    expect(resolvePostgresConnection('postgres://h/db?sslmode=no-verify').ssl).toEqual({ rejectUnauthorized: false });
  });

  it('lets DATABASE_SSL override the URL', () => {
    expect(resolvePostgresConnection('postgres://h/db', 'require').ssl).toEqual({ rejectUnauthorized: true });
    expect(resolvePostgresConnection('postgres://h/db?sslmode=require', 'disable').ssl).toBe(false);
    expect(resolvePostgresConnection('postgres://h/db', 'no-verify').ssl).toEqual({ rejectUnauthorized: false });
    expect(resolvePostgresConnection('postgres://h/db?sslmode=require', '').ssl).toEqual({ rejectUnauthorized: true });
  });

  it('keeps other query parameters', () => {
    expect(resolvePostgresConnection('postgres://h/db?sslmode=require&connect_timeout=5').url).toBe('postgres://h/db?connect_timeout=5');
  });
});
