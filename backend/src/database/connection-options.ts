/**
 * How the app (and the migration runner) connect to Postgres.
 *
 * TypeORM reads only host, port, user, password and database from `DATABASE_URL`; it drops the query string, so a
 * `?sslmode=require` would silently be ignored and Azure (which refuses plain connections) would reject us. This
 * module turns the URL's `sslmode` (or the explicit `DATABASE_SSL` override) into node-postgres' `ssl` option and
 * hands TypeORM a clean URL.
 *
 * `require` here means TLS **with** certificate verification against Node's trusted CAs. That is stricter than
 * libpq's `require`, and right for Azure Database for PostgreSQL (publicly trusted DigiCert / Microsoft roots). Use
 * `no-verify` only for a server with a self-signed certificate.
 */
export type DatabaseSslMode = 'disable' | 'require' | 'no-verify';

export const DATABASE_SSL_MODES: readonly DatabaseSslMode[] = ['disable', 'require', 'no-verify'];

export interface PostgresConnection {
  /** The URL without `sslmode` / `ssl` parameters. */
  readonly url: string;
  /** node-postgres `ssl` option. */
  readonly ssl: false | { readonly rejectUnauthorized: boolean };
  readonly mode: DatabaseSslMode;
}

/** libpq `sslmode` (and the `ssl=true` shorthand) → our three modes. Unknown / absent → disable. */
function modeFromUrlParams(sslmode: string | null, ssl: string | null): DatabaseSslMode {
  switch (sslmode?.toLowerCase()) {
    case 'require':
    case 'verify-ca':
    case 'verify-full':
      return 'require';
    case 'no-verify':
      return 'no-verify';
    case 'disable':
    case 'allow':
    case 'prefer':
      return 'disable';
    default:
      return ssl === 'true' || ssl === '1' ? 'require' : 'disable';
  }
}

export function resolvePostgresConnection(rawUrl: string, override?: string | null): PostgresConnection {
  let url = rawUrl;
  let sslmode: string | null = null;
  let ssl: string | null = null;
  try {
    const parsed = new URL(rawUrl);
    sslmode = parsed.searchParams.get('sslmode');
    ssl = parsed.searchParams.get('ssl');
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    url = parsed.toString();
  } catch {
    // Not parseable: let the driver report it; no TLS.
  }
  const requested = override?.trim().toLowerCase();
  const mode: DatabaseSslMode = DATABASE_SSL_MODES.includes(requested as DatabaseSslMode)
    ? (requested as DatabaseSslMode)
    : modeFromUrlParams(sslmode, ssl);
  return {
    url,
    mode,
    ssl: mode === 'disable' ? false : { rejectUnauthorized: mode === 'require' },
  };
}
