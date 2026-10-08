/**
 * Whole-naira amount entry: what the player types or taps on the keypad becomes a safe integer (or null when empty).
 * Pure so the keypad, the text field and the tests agree.
 */

/** Largest amount the keypad accepts (₦999,999,999,999). Server limits are far below; this only stops overflow. */
export const MAX_AMOUNT_DIGITS = 12;

/** "₦12,500" / "12 500" / "12500.75" → 12500. Kobo are ignored (in-game naira are whole). Empty → null. */
export function parseNairaInput(raw: string): number | null {
  const whole = raw.split('.')[0] ?? '';
  const digits = whole.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_AMOUNT_DIGITS);
  if (digits.length === 0) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/** Grouped digits for the amount display: 1250000 → "1,250,000"; null → "". */
export function groupDigits(amount: number | null): string {
  if (amount === null) return '';
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(amount);
}

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | 'back' | 'clear';

/** Apply one keypad press to the current amount. */
export function pressKey(amount: number | null, key: KeypadKey): number | null {
  const digits = amount === null ? '' : String(amount);
  if (key === 'clear') return null;
  if (key === 'back') return parseNairaInput(digits.slice(0, -1));
  if (digits.length === 0 && (key === '0' || key === '00')) return null;
  return parseNairaInput(digits + key);
}

/** A fresh idempotency key for one money intent (retries reuse it so money moves once). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
