/**
 * The Lagos boom: what the game pays (job pay, business takings) is the real-Lagos figure × INCOME_MULTIPLIER, while
 * prices (homes, cars, food, fares) stay at Lagos prices. A steady worker playing for a real month (≈60 game months)
 * can buy a starter house and a good car. Money moving between players (daily transfer and receive limits) and
 * top-up packs scale by the same factor, so their weight relative to earnings doesn't change.
 */
export const INCOME_MULTIPLIER = 8;

/** `amount` × INCOME_MULTIPLIER, rounded to `step` (whole ₦1,000 by default; pass 1 for small units like dollars). */
export function boosted(amount: number, step: number = 1_000): number {
  return Math.round((amount * INCOME_MULTIPLIER) / step) * step;
}
