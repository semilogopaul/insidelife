/**
 * Payments catalog — owned by the payments domain.
 *
 * Top-up packs sell in-game naira for real naira through Paystack. Prices are real naira (charged in kobo); the
 * virtual amount is what lands in the wallet, flagged as *purchased* (never counts toward the self-made rich list).
 * See docs/GAME_DESIGN.md §6 "Paystack top-ups".
 */

export const TOPUP_PACKAGE_IDS = ['small-chops', 'jollof-pack', 'owambe-pack', 'big-boy-pack', 'odogwu-pack'] as const;
export type TopupPackageId = (typeof TOPUP_PACKAGE_IDS)[number];

export interface TopupPackage {
  readonly id: TopupPackageId;
  readonly label: string;
  readonly blurb: string;
  /** Real naira charged through Paystack. */
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

/** Default real-money cap per account per real (UTC) day for top-ups; the server's configured value wins. */
export const DEFAULT_TOPUP_DAILY_LIMIT_NGN = 20_000;
