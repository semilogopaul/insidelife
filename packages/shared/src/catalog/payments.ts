/**
 * Payments catalog — owned by the payments domain.
 *
 * Top-up packs sell in-game naira for real naira through Flutterwave. Prices are real naira (charged in kobo); the
 * virtual amount is what lands in the wallet, flagged as *purchased* (never counts toward the self-made rich list).
 * Besides the packs, a player can pay any whole-naira amount (₦500 up to the server's per-payment maximum): it
 * credits at the rate of the largest pack it reaches (`topupVirtualAmount`).
 * Players may also pay in US dollars when the server enables it (`PAYMENTS_USD_ENABLED`): the game stays in naira,
 * dollars are only a way to pay, converted at the owner's "₦ per $1 for payments" rate (`usd-rate` on the rate card).
 * See docs/GAME_DESIGN.md §6 "Top-ups (real money)".
 */
import { boosted } from '../money/income-multiplier.js';
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
  { id: 'small-chops', label: 'Small chops', blurb: 'Enough for a few danfo rides and suya.', priceNgn: 500, virtualAmount: boosted(150_000) },
  { id: 'jollof-pack', label: 'Jollof pack', blurb: 'Party jollof money. No be small thing.', priceNgn: 1_000, virtualAmount: boosted(350_000) },
  { id: 'owambe-pack', label: 'Owambe pack', blurb: 'Aso-ebi, gele and small spraying.', priceNgn: 2_500, virtualAmount: boosted(1_000_000) },
  { id: 'big-boy-pack', label: 'Big Boy pack', blurb: 'Tokunbo-car deposit energy.', priceNgn: 5_000, virtualAmount: boosted(2_200_000) },
  { id: 'odogwu-pack', label: 'Odogwu pack', blurb: 'For when you want to move like Odogwu.', priceNgn: 10_000, virtualAmount: boosted(5_000_000) },
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

// ----- Paying in dollars ------------------------------------------------------------------------------------------

/**
 * Currencies a real-money payment can be made in. Amounts are stored and verified in the currency's minor units:
 * kobo for NGN, cents for USD (both 1/100). The game itself only ever deals in naira.
 */
export const PAYMENT_CURRENCIES = ['NGN', 'USD'] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export function isPaymentCurrency(value: unknown): value is PaymentCurrency {
  return typeof value === 'string' && (PAYMENT_CURRENCIES as readonly string[]).includes(value);
}

/**
 * How the player pays on Flutterwave: `card` is the hosted checkout (cards, plus bank transfer and USSD for naira);
 * `applepay` / `googlepay` are wallet checkouts, dollars only, offered when the server enables them
 * (`PAYMENTS_WALLETS_ENABLED`). Apple Pay only works in Safari.
 */
export const PAYMENT_METHODS = ['card', 'applepay', 'googlepay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const WALLET_PAYMENT_METHODS: readonly PaymentMethod[] = ['applepay', 'googlepay'];

export const CENTS_PER_DOLLAR = 100;

/** Rate-card key of the exchange rate: "₦ per $1 for payments" (owner-editable, unit `ngn-per-usd`). */
export const USD_RATE_KEY = 'usd-rate';
export const DEFAULT_USD_RATE_NGN = 1_500;
export const USD_RATE_MIN_NGN = 500;
export const USD_RATE_MAX_NGN = 5_000;

/** Whole naira per $1 from ₦500 to ₦5,000: the only exchange rates the owner can set. */
export function isValidUsdRateNgn(ngnPerUsd: number): boolean {
  return Number.isSafeInteger(ngnPerUsd) && ngnPerUsd >= USD_RATE_MIN_NGN && ngnPerUsd <= USD_RATE_MAX_NGN;
}

/** Smallest dollar charge: a price under $1 at the current rate is paid in naira. */
export const USD_MIN_CHARGE_CENTS = 100;

/** Smallest dollar top-up (whole dollars). At the lowest rate (₦500), $1 is exactly the ₦500 naira minimum. */
export const TOPUP_MIN_USD = 1;
/** Default largest single dollar top-up; the server's TOPUP_MAX_PER_PAYMENT_USD wins. */
export const DEFAULT_TOPUP_MAX_PER_PAYMENT_USD = 5_000;
/** Quick picks for dollar top-ups (any whole amount from $1 to the maximum can also be paid). */
export const TOPUP_USD_QUICK_PICKS: readonly number[] = [1, 5, 10, 25, 50];

/** "$10", "$6.67", "-$1.50", "$5,000". */
export function formatUsdCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / CENTS_PER_DOLLAR).toLocaleString('en-US');
  const rest = abs % CENTS_PER_DOLLAR;
  return `${sign}$${dollars}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

/** A real-money amount in its currency's minor units: "₦2,500" (kobo) or "$6.67" (cents). */
export function formatPaymentAmount(currency: PaymentCurrency, minor: number): string {
  return currency === 'USD' ? formatUsdCents(minor) : formatNaira(minor / 100);
}

/**
 * The dollar price of a naira price at `ngnPerUsd`, in cents: kobo ÷ rate (₦ per $1 × 100 kobo per ₦ and 100 cents
 * per $ cancel out), rounded UP to the cent so a dollar payment is never worth less than the naira price. Exact
 * integer result. Throws a RangeError for a negative or non-whole amount, or an invalid rate.
 */
export function usdCentsForKobo(kobo: number, ngnPerUsd: number): number {
  if (!Number.isSafeInteger(kobo) || kobo < 0) throw new RangeError('A price must be a whole number of kobo');
  if (!isValidUsdRateNgn(ngnPerUsd)) throw new RangeError(`The exchange rate must be whole naira from ${formatNaira(USD_RATE_MIN_NGN)} to ${formatNaira(USD_RATE_MAX_NGN)}`);
  // The float quotient is only a starting point: settle on the smallest whole number of cents worth at least `kobo`.
  let cents = Math.ceil(kobo / ngnPerUsd);
  while (cents > 0 && (cents - 1) * ngnPerUsd >= kobo) cents -= 1;
  while (cents * ngnPerUsd < kobo) cents += 1;
  return cents;
}

/** Naira value (kobo) of a dollar amount (cents) at `ngnPerUsd`: exactly cents × rate. */
export function koboForUsdCents(cents: number, ngnPerUsd: number): number {
  return cents * ngnPerUsd;
}

/** Why `dollars` can't be topped up (player-facing), or null. `maxUsd` is the server's per-payment maximum. */
export function topupUsdAmountProblem(dollars: number, maxUsd: number = DEFAULT_TOPUP_MAX_PER_PAYMENT_USD): string | null {
  if (!Number.isSafeInteger(dollars)) return 'Enter a whole dollar amount';
  if (dollars < TOPUP_MIN_USD) return `Dollar top-ups start at ${formatUsdCents(TOPUP_MIN_USD * CENTS_PER_DOLLAR)}`;
  if (dollars > maxUsd) return `One dollar top-up can be at most ${formatUsdCents(maxUsd * CENTS_PER_DOLLAR)}`;
  return null;
}

/**
 * In-game naira credited for a top-up of `dollars` whole US dollars at `ngnPerUsd`: exactly what the same value in
 * naira credits (`topupVirtualAmount(dollars × rate)`, rate tier included), so paying in either currency is equal.
 * Throws a RangeError for a non-whole or sub-$1 amount, or an invalid rate.
 */
export function topupVirtualAmountUsd(dollars: number, ngnPerUsd: number): number {
  if (!Number.isSafeInteger(dollars) || dollars < TOPUP_MIN_USD) throw new RangeError(`Dollar top-ups are whole dollars from $${TOPUP_MIN_USD}`);
  if (!isValidUsdRateNgn(ngnPerUsd)) throw new RangeError('The exchange rate is out of range');
  return topupVirtualAmount(dollars * ngnPerUsd);
}
