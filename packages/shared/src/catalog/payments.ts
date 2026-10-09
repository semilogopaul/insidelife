/**
 * Payments catalog — owned by the payments domain.
 *
 * Top-up packs sell in-game naira for real naira through Flutterwave. Prices are real naira (charged in kobo); the
 * virtual amount is what lands in the wallet, flagged as *purchased* (never counts toward the self-made rich list).
 * Besides the packs, a player can pay any whole-naira amount (₦500 up to the server's per-payment maximum): it
 * credits at the rate of the largest pack it reaches (`topupVirtualAmount`).
 * See docs/GAME_DESIGN.md §6 "Top-ups (real money)".
 */
import { formatNaira } from '../money/money.js';

export const TOPUP_PACKAGE_IDS = ['small-chops', 'jollof-pack', 'owambe-pack', 'big-boy-pack', 'odogwu-pack'] as const;
export type TopupPackageId = (typeof TOPUP_PACKAGE_IDS)[number];

export interface TopupPackage {
  readonly id: TopupPackageId;
  readonly label: string;
  readonly blurb: string;
  /** Real naira charged through Flutterwave. */
  readonly priceNgn: number;
  /** In-game naira credited to the wallet. */
  readonly virtualAmount: number;
}

export const TOPUP_PACKAGES: readonly TopupPackage[] = [
  { id: 'small-chops', label: 'Small chops', blurb: 'Enough for a few danfo rides and suya.', priceNgn: 500, virtualAmount: 150_000 },
  { id: 'jollof-pack', label: 'Jollof pack', blurb: 'Party jollof money. No be small thing.', priceNgn: 1_000, virtualAmount: 350_000 },
  { id: 'owambe-pack', label: 'Owambe pack', blurb: 'Aso-ebi, gele and small spraying.', priceNgn: 2_500, virtualAmount: 1_000_000 },
  { id: 'big-boy-pack', label: 'Big Boy pack', blurb: 'Tokunbo-car deposit energy.', priceNgn: 5_000, virtualAmount: 2_200_000 },
  { id: 'odogwu-pack', label: 'Odogwu pack', blurb: 'For when you want to move like Odogwu.', priceNgn: 10_000, virtualAmount: 5_000_000 },
];

export function findTopupPackage(id: string): TopupPackage | undefined {
  return TOPUP_PACKAGES.find((pack) => pack.id === id);
}

// ----- Custom amounts --------------------------------------------------------------------------------------------

/** Smallest top-up, pack or custom (real naira). */
export const TOPUP_MIN_NGN = 500;
/** Default largest single top-up (real naira); the server's TOPUP_MAX_PER_PAYMENT_NGN wins. */
export const DEFAULT_TOPUP_MAX_PER_PAYMENT_NGN = 10_000_000;
/** Default daily real-money cap per account: 0 = no cap (the server's TOPUP_DAILY_LIMIT_NGN can switch one on). */
export const DEFAULT_TOPUP_DAILY_LIMIT_NGN = 0;
/** `subjectId` of a custom-amount top-up payment. */
export const CUSTOM_TOPUP_ID = 'custom';

export interface TopupRateTier {
  /** The tier applies from this many real naira (a pack's price)… */
  readonly fromNgn: number;
  /** …at this many game naira per real ₦1 (that pack's rate). */
  readonly perNaira: number;
  readonly packageId: TopupPackageId;
}

/** One tier per pack, cheapest first: 300, 350, 400, 440, 500 game naira per real ₦1. */
export const TOPUP_RATE_TIERS: readonly TopupRateTier[] = TOPUP_PACKAGES.map((pack) => ({
  fromNgn: pack.priceNgn,
  perNaira: pack.virtualAmount / pack.priceNgn,
  packageId: pack.id,
})).toSorted((a, b) => a.fromNgn - b.fromNgn);

/**
 * Game naira per real ₦1 for a top-up of `priceNgn`: the rate of the largest pack whose price is at most the amount,
 * so a pack and a custom amount at the same price credit the same, and ₦10,000 or more gets the best rate.
 * Null below the ₦500 minimum.
 */
export function topupRateFor(priceNgn: number): number | null {
  let rate: number | null = null;
  for (const tier of TOPUP_RATE_TIERS) if (priceNgn >= tier.fromNgn) rate = tier.perNaira;
  return rate;
}

/** Why `priceNgn` can't be bought (player-facing), or null. `maxNgn` is the server's per-payment maximum. */
export function topupAmountProblem(priceNgn: number, maxNgn: number = DEFAULT_TOPUP_MAX_PER_PAYMENT_NGN): string | null {
  if (!Number.isSafeInteger(priceNgn)) return 'Enter a whole naira amount';
  if (priceNgn < TOPUP_MIN_NGN) return `Top-ups start at ${formatNaira(TOPUP_MIN_NGN)}`;
  if (priceNgn > maxNgn) return `One top-up can be at most ${formatNaira(maxNgn)}`;
  return null;
}

/**
 * In-game naira credited for a top-up of `priceNgn` real naira: amount × `topupRateFor(amount)`. Every pack credits
 * exactly its `virtualAmount`. Throws a RangeError for a non-whole amount or one under the minimum.
 */
export function topupVirtualAmount(priceNgn: number): number {
  const rate = Number.isSafeInteger(priceNgn) ? topupRateFor(priceNgn) : null;
  if (rate === null) throw new RangeError(`Top-ups are whole naira from ${formatNaira(TOPUP_MIN_NGN)}`);
  return priceNgn * rate;
}
