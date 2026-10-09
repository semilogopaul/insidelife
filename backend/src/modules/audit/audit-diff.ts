/**
 * Keys whose values never belong in the audit log: passwords, hashes, secrets, tokens and one-time codes. Matched on
 * the end of the key (`passwordHash`, `pendingSecret`, `refreshToken`, `recoveryCodeHashes`) or the whole key, so
 * counts such as `recoveryCodesLeft` and `recoveryCodesIssued` stay readable.
 */
const SECRET_KEY = /(password|passwordhash|secret|token|hash|hashes)$|^(otp|totp|otpauthurl|code|codes|recoverycode|recoverycodes)$/i;

const REDACTED = '[redacted]';

type Snapshot = Readonly<Record<string, unknown>>;

/** Dates become ISO strings, undefined becomes null, secrets are redacted: what Postgres jsonb will store. */
function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalise);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Snapshot).map(([key, inner]) => [key, SECRET_KEY.test(key) ? REDACTED : normalise(inner)]),
    );
  }
  return value;
}

/** Stable JSON (sorted keys) so `{a,b}` and `{b,a}` compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Snapshot).toSorted(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The fields that changed between two snapshots, as `{ before, after }` holding only those fields (top-level keys;
 * nested objects are compared whole). A field present on one side only is a change from/to null. A missing side stays
 * null (creation or removal).
 */
export function auditChanges(
  before: Snapshot | null | undefined,
  after: Snapshot | null | undefined,
): { readonly before: Snapshot | null; readonly after: Snapshot | null } {
  if (!before && !after) return { before: null, after: null };
  if (!before) return { before: null, after: normalise(after) as Snapshot };
  if (!after) return { before: normalise(before) as Snapshot, after: null };
  const was = normalise(before) as Record<string, unknown>;
  const now = normalise(after) as Record<string, unknown>;
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
    const a = key in was ? was[key] : null;
    const b = key in now ? now[key] : null;
    if (canonical(a) === canonical(b)) continue;
    changedBefore[key] = a;
    changedAfter[key] = b;
  }
  return { before: changedBefore, after: changedAfter };
}

/** Metadata goes through the same normalisation (dates, undefined, secrets). */
export function auditMetadata(metadata: Snapshot | undefined): Snapshot {
  return metadata ? (normalise(metadata) as Snapshot) : {};
}
