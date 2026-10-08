/**
 * Money.
 *
 * In-game naira are whole units stored as BIGINT on the server and handled as
 * safe JS integers (well below 2^53). Real-money amounts for Paystack are kobo.
 */

export const KOBO_PER_NAIRA = 100;

/** Upper bound for any single in-game amount; guards against overflow-style exploits. */
export const MAX_SAFE_NAIRA = 1_000_000_000_000; // ₦1 trillion

export function assertSafeNaira(amount: number): void {
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > MAX_SAFE_NAIRA) {
    throw new RangeError(`Unsafe naira amount: ${amount}`);
  }
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * KOBO_PER_NAIRA);
}

export function koboToNaira(kobo: number): number {
  return kobo / KOBO_PER_NAIRA;
}

const fullFormatter = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** "₦1,250,000" (negative amounts as "-₦5,000"). */
export function formatNaira(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}₦${fullFormatter.format(Math.abs(Math.round(amount)))}`;
}

const COMPACT_UNITS = [
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'k' },
] as const;

/** "₦1.25M", "₦850k", "₦12.4B". Exact below ₦10,000. */
export function formatNairaCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs < 10_000) return formatNaira(amount);
  for (const unit of COMPACT_UNITS) {
    if (abs >= unit.value) {
      const scaled = abs / unit.value;
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return `${sign}₦${Number(scaled.toFixed(digits))}${unit.suffix}`;
    }
  }
  return formatNaira(amount);
}

/** Percentage helper: 0.075 -> "7.5%". */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  return `${Number((ratio * 100).toFixed(fractionDigits))}%`;
}
