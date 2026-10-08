import { DAYS_PER_MONTH, DAYS_PER_YEAR, MINUTES_PER_DAY } from '../time/calendar.js';
import { rngFor } from '../random/rng.js';
import { WITHHOLDING_TAX_RATE } from '../rules/finance.js';
import { activeWorldEvents, economyOn, type EconomyState, type WorldEventKind } from '../world/world.js';

/**
 * Investments catalog — owned by the investments domain.
 *
 * - Ten fictional NGX stocks and four crypto assets with deterministic daily prices (`priceOn`).
 * - Fixed-income products (savings, fixed deposits, T-bills, money-market fund) priced off the world economy.
 * - Broker fees, FX spread maths and withholding tax helpers shared by server (authoritative) and client (previews).
 *
 * Calibration (see docs/GAME_DESIGN.md §10): stocks return ~10-13%/yr in expectation (price drift + dividends) with
 * 25-45% volatility; crypto is wild; T-bills pay ~11%; interest and dividends lose 10% withholding tax. Patient
 * investing beats idle cash (0% — the world price index mean-reverts) but ₦10m at 12% is ₦100k a month, which never
 * outruns a real career.
 */

// ---------------------------------------------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------------------------------------------

export const INSTRUMENT_KINDS = ['stock', 'crypto'] as const;
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

export const MARKET_SECTORS = [
  'banking',
  'oil-gas',
  'telecom',
  'fmcg',
  'construction',
  'fintech',
  'industrial',
  'media',
  'insurance',
  'agriculture',
  'crypto',
] as const;
export type MarketSector = (typeof MARKET_SECTORS)[number];

export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

export interface InstrumentDefinition {
  /** Ticker, also the id used in the API. */
  readonly id: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly sector: MarketSector;
  readonly blurb: string;
  /** Price on day 0: naira for stocks, US dollars for crypto (converted at the day's parallel rate). */
  readonly basePrice: number;
  /** Expected annual total return (GBM drift μ). For stocks it includes the dividend, which is paid out. */
  readonly drift: number;
  /** Annualised volatility σ. */
  readonly volatility: number;
  /** Annual dividend as a share of price (stocks). */
  readonly dividendYield: number;
  /** Month (1-12) whose 15th is the ex-dividend date; null when the company doesn't pay. */
  readonly dividendMonth: number | null;
  readonly risk: RiskLevel;
  /** Stablecoin: hugs its peg with tiny daily noise instead of a random walk. */
  readonly stable?: boolean;
  /** Memecoin: random pump-and-dump episodes on top of the walk. */
  readonly pumps?: boolean;
}

export const INSTRUMENTS: readonly InstrumentDefinition[] = [
  {
    id: 'EKOTRUST',
    name: 'Eko Trust Bank Plc',
    kind: 'stock',
    sector: 'banking',
    blurb: 'Tier-1 bank with branches from Marina to Ikorodu. Fat dividends, moves with the naira.',
    basePrice: 62,
    drift: 0.11,
    volatility: 0.3,
    dividendYield: 0.06,
    dividendMonth: 4,
    risk: 'medium',
  },
  {
    id: 'LAGOONPET',
    name: 'Lagoon Petroleum Plc',
    kind: 'stock',
    sector: 'oil-gas',
    blurb: 'Upstream oil producer with dollar revenue. Loves devaluation and fuel queues.',
    basePrice: 340,
    drift: 0.12,
    volatility: 0.4,
    dividendYield: 0.04,
    dividendMonth: 5,
    risk: 'high',
  },
  {
    id: 'NAIJATEL',
    name: 'NaijaTel Communications Plc',
    kind: 'stock',
    sector: 'telecom',
    blurb: 'The network everybody complains about and everybody uses. Steady earner.',
    basePrice: 255,
    drift: 0.11,
    volatility: 0.28,
    dividendYield: 0.05,
    dividendMonth: 3,
    risk: 'medium',
  },
  {
    id: 'EKOFOODS',
    name: 'Eko Foods Nigeria Plc',
    kind: 'stock',
    sector: 'fmcg',
    blurb: 'Noodles, seasoning cubes and malt drinks. Hurt by fuel scarcity and imported inputs.',
    basePrice: 48,
    drift: 0.1,
    volatility: 0.25,
    dividendYield: 0.05,
    dividendMonth: 6,
    risk: 'medium',
  },
  {
    id: 'BRIDGEWAY',
    name: 'Bridgeway Construction Plc',
    kind: 'stock',
    sector: 'construction',
    blurb: 'Builds roads and bridges when government pays. Diesel-hungry.',
    basePrice: 92,
    drift: 0.11,
    volatility: 0.38,
    dividendYield: 0.02,
    dividendMonth: 7,
    risk: 'high',
  },
  {
    id: 'PAYSTREAM',
    name: 'PayStream Fintech Plc',
    kind: 'stock',
    sector: 'fintech',
    blurb: 'POS terminals and a buzzing payments app. No dividend — all growth, all drama.',
    basePrice: 18.5,
    drift: 0.13,
    volatility: 0.45,
    dividendYield: 0,
    dividendMonth: null,
    risk: 'high',
  },
  {
    id: 'AFRICEM',
    name: 'Africem Cement Plc',
    kind: 'stock',
    sector: 'industrial',
    blurb: 'Every Lagos building starts with a bag of Africem. Defensive, dependable.',
    basePrice: 410,
    drift: 0.105,
    volatility: 0.27,
    dividendYield: 0.045,
    dividendMonth: 4,
    risk: 'medium',
  },
  {
    id: 'NOLLYMEDIA',
    name: 'Nolly Media Group Plc',
    kind: 'stock',
    sector: 'media',
    blurb: 'Cinemas, streaming and Detty December concerts. Feast or famine.',
    basePrice: 12.4,
    drift: 0.11,
    volatility: 0.42,
    dividendYield: 0.01,
    dividendMonth: 9,
    risk: 'high',
  },
  {
    id: 'ATLANTICINS',
    name: 'Atlantic Insurance Plc',
    kind: 'stock',
    sector: 'insurance',
    blurb: 'Penny-stock insurer. Cheap per share, slow to pay claims.',
    basePrice: 8.2,
    drift: 0.1,
    volatility: 0.35,
    dividendYield: 0.04,
    dividendMonth: 8,
    risk: 'medium',
  },
  {
    id: 'GREENFARM',
    name: 'Greenfarm Agro Plc',
    kind: 'stock',
    sector: 'agriculture',
    blurb: 'Rice and cassava from Kebbi to Ogun. Fuel scarcity hurts getting produce to market.',
    basePrice: 34,
    drift: 0.11,
    volatility: 0.36,
    dividendYield: 0.03,
    dividendMonth: 10,
    risk: 'high',
  },
  {
    id: 'BTC',
    name: 'Bitcoin',
    kind: 'crypto',
    sector: 'crypto',
    blurb: 'Digital gold, priced in dollars. Naira price jumps when the naira falls.',
    basePrice: 98_000,
    drift: 0.2,
    volatility: 0.6,
    dividendYield: 0,
    dividendMonth: null,
    risk: 'high',
  },
  {
    id: 'ETH',
    name: 'Ethereum',
    kind: 'crypto',
    sector: 'crypto',
    blurb: 'The world computer. Even wilder than Bitcoin.',
    basePrice: 3_600,
    drift: 0.22,
    volatility: 0.75,
    dividendYield: 0,
    dividendMonth: null,
    risk: 'extreme',
  },
  {
    id: 'USDT',
    name: 'Tether (USDT)',
    kind: 'crypto',
    sector: 'crypto',
    blurb: 'Dollar stablecoin — tracks the parallel-market dollar rate.',
    basePrice: 1,
    drift: 0,
    volatility: 0.002,
    dividendYield: 0,
    dividendMonth: null,
    risk: 'low',
    stable: true,
  },
  {
    id: 'JOLLOF',
    name: '$JOLLOF memecoin',
    kind: 'crypto',
    sector: 'crypto',
    blurb: 'Launched on X Space by a guy with a lion avatar. Pumps hard, dumps harder.',
    basePrice: 0.004,
    drift: 0.2,
    volatility: 1.5,
    dividendYield: 0,
    dividendMonth: null,
    risk: 'extreme',
    pumps: true,
  },
];

export function findInstrument(id: string): InstrumentDefinition | undefined {
  const normalised = id.trim().toUpperCase();
  return INSTRUMENTS.find((instrument) => instrument.id === normalised);
}

// ---------------------------------------------------------------------------------------------------------------
// Deterministic prices
// ---------------------------------------------------------------------------------------------------------------

/**
 * Brownian motion on whole days via a Brownian-bridge (dyadic) construction, so any day can be evaluated
 * without iterating from day 0:
 *
 * - Anchors W(k·BLOCK) are a seeded random walk with N(0, BLOCK) steps (a few per decade, cached per series).
 * - Inside a block, the value at any day is found by bisection: W(mid) = (W(lo)+W(hi))/2 + √((hi−lo)/4)·Z, where Z is
 *   seeded by (series, block, mid). Every dyadic midpoint is drawn exactly once, so the path is consistent and has the
 *   exact Brownian law (Var W(d) = d).
 *
 * Cost per lookup: O(log₂ BLOCK) = 12 seeded normals (+ the amortised anchor walk), plus a bounded memo cache.
 */
const BLOCK_DAYS = 4096;
const SQRT_DAYS_PER_YEAR = Math.sqrt(DAYS_PER_YEAR);
const CACHE_LIMIT = 50_000;

const anchorCache = new Map<string, number[]>();
const priceCache = new Map<string, number>();

function gaussian(...parts: ReadonlyArray<string | number>): number {
  return rngFor(...parts).normal();
}

function anchor(seed: string, series: string, block: number): number {
  const key = `${seed}:${series}`;
  let anchors = anchorCache.get(key);
  if (!anchors) {
    if (anchorCache.size > 256) anchorCache.clear();
    anchors = [0];
    anchorCache.set(key, anchors);
  }
  while (anchors.length <= block) {
    const k = anchors.length - 1;
    anchors.push((anchors[k] ?? 0) + Math.sqrt(BLOCK_DAYS) * gaussian(seed, 'market-anchor', series, k));
  }
  return anchors[block] ?? 0;
}

/** Standard Brownian motion (variance 1 per day) for a series, evaluated at a whole day. */
export function brownianAt(seed: string, series: string, day: number): number {
  const d = Math.max(0, Math.floor(day));
  const block = Math.floor(d / BLOCK_DAYS);
  const target = d - block * BLOCK_DAYS;
  let lo = 0;
  let hi = BLOCK_DAYS;
  let wLo = anchor(seed, series, block);
  let wHi = anchor(seed, series, block + 1);
  for (;;) {
    if (target === lo) return wLo;
    if (target === hi) return wHi;
    const mid = (lo + hi) / 2;
    const wMid = (wLo + wHi) / 2 + Math.sqrt((hi - lo) / 4) * gaussian(seed, 'market-bridge', series, block, mid);
    if (target < mid) {
      hi = mid;
      wHi = wMid;
    } else {
      lo = mid;
      wLo = wMid;
    }
  }
}

/** How strongly each sector reacts while a world event is active (log-price shift at full intensity). */
const EVENT_SENSITIVITY: Readonly<Partial<Record<WorldEventKind, Partial<Record<MarketSector | 'all', number>>>>> = {
  'fuel-scarcity': { 'oil-gas': 0.08, fmcg: -0.07, construction: -0.06, agriculture: -0.07, media: -0.03, industrial: -0.04 },
  devaluation: { 'oil-gas': 0.1, banking: -0.06, fmcg: -0.08, telecom: -0.05, fintech: -0.05, insurance: -0.03, industrial: -0.03, crypto: 0.05 },
  'detty-december': { media: 0.06, fmcg: 0.03, fintech: 0.02 },
  'grid-collapse': { telecom: -0.03, industrial: -0.03, 'oil-gas': 0.02 },
  'election-season': { all: -0.04, crypto: 0.02 },
};

const EVENT_RAMP_MINUTES = 2 * MINUTES_PER_DAY;

/** Temporary multiplicative effect of world events on an instrument at a given day (midday). */
function eventFactor(seed: string, instrument: InstrumentDefinition, dayIndex: number): number {
  const t = dayIndex * MINUTES_PER_DAY + MINUTES_PER_DAY / 2;
  let shift = 0;
  for (const event of activeWorldEvents(seed, t)) {
    const table = EVENT_SENSITIVITY[event.kind];
    if (!table) continue;
    const sensitivity = (table[instrument.sector] ?? 0) + (instrument.kind === 'stock' ? (table.all ?? 0) : 0);
    if (sensitivity === 0) continue;
    // Ramp in and out over two days; devaluation shocks fade as the market digests them (like the FX rate).
    let intensity = Math.min(1, (t - event.startsAt) / EVENT_RAMP_MINUTES, (event.endsAt - t) / EVENT_RAMP_MINUTES);
    if (event.kind === 'devaluation') intensity *= 1 - (t - event.startsAt) / (event.endsAt - event.startsAt);
    shift += sensitivity * Math.max(0, intensity);
  }
  return Math.exp(shift);
}

/** Memecoin pump-and-dumps: in ~30% of 60-day windows the price spikes 2-5× over 4 days and crashes over the next 4. */
function pumpFactor(seed: string, instrument: InstrumentDefinition, dayIndex: number): number {
  const window = Math.floor(dayIndex / 60);
  const rng = rngFor(seed, 'market-pump', instrument.id, window);
  if (!rng.chance(0.3)) return 1;
  const start = window * 60 + rng.int(0, 50);
  const height = rng.float(1, 4);
  const offset = dayIndex - start;
  if (offset < 0 || offset > 8) return 1;
  return 1 + height * (offset <= 4 ? offset / 4 : (8 - offset) / 4);
}

/** Day index (from the calendar origin) of the first ex-dividend date, or null. Ex-dates are the 15th of the month. */
function firstExDividendDay(instrument: InstrumentDefinition): number | null {
  if (instrument.dividendMonth === null || instrument.dividendYield <= 0) return null;
  return (instrument.dividendMonth - 1) * DAYS_PER_MONTH + 14;
}

/** Number of ex-dividend dates on or before `dayIndex` (the price drops by the yield on each). */
export function exDividendCount(instrument: InstrumentDefinition, dayIndex: number): number {
  const first = firstExDividendDay(instrument);
  if (first === null || dayIndex < first) return 0;
  return Math.floor((dayIndex - first) / DAYS_PER_YEAR) + 1;
}

/**
 * True when `dayIndex` is the record date (the day before an ex-dividend date): holders at the end of this day are
 * paid, and the price drops by the yield the next morning — so buying just for the dividend never pays.
 */
export function isDividendRecordDay(instrument: InstrumentDefinition, dayIndex: number): boolean {
  const first = firstExDividendDay(instrument);
  if (first === null) return false;
  const exDay = dayIndex + 1;
  return exDay >= first && (exDay - first) % DAYS_PER_YEAR === 0;
}

function roundPrice(price: number): number {
  const floored = Math.max(0.0001, price);
  return floored >= 1 ? Math.round(floored * 100) / 100 : Number(floored.toPrecision(4));
}

function computeUsdOrNairaPrice(worldSeed: string, marketSeed: string, instrument: InstrumentDefinition, day: number): number {
  if (instrument.stable) {
    return instrument.basePrice * (1 + instrument.volatility * gaussian(marketSeed, 'market-peg', instrument.id, day));
  }
  const years = day / DAYS_PER_YEAR;
  const sigma = instrument.volatility;
  const logReturn =
    (instrument.drift - (sigma * sigma) / 2) * years + (sigma * brownianAt(marketSeed, instrument.id, day)) / SQRT_DAYS_PER_YEAR;
  let price = instrument.basePrice * Math.exp(logReturn);
  price *= (1 - instrument.dividendYield) ** exDividendCount(instrument, day);
  price *= eventFactor(worldSeed, instrument, day);
  if (instrument.pumps) price *= pumpFactor(marketSeed, instrument, day);
  return price;
}

/**
 * Naira price of one unit of an instrument on a world day. Pure and deterministic: a function of the instrument, the
 * day and the seeds only. Crypto is priced in dollars and converted at that day's parallel rate, so a naira
 * devaluation lifts crypto's naira price automatically. Throws for unknown instruments.
 *
 * `worldSeed` drives world events and the FX rate (shared with every replica). `marketSeed` drives the random walks
 * and pumps; the server passes a secret one so tomorrow's prices can't be computed by a client that knows the public
 * world seed (defaults to the world seed for tests and offline tools).
 */
export function priceOn(instrumentId: string, dayIndex: number, worldSeed: string, marketSeed: string = worldSeed): number {
  const instrument = findInstrument(instrumentId);
  if (!instrument) throw new RangeError(`Unknown instrument: ${instrumentId}`);
  const day = Math.max(0, Math.floor(dayIndex));
  const key = `${worldSeed}|${marketSeed}|${instrument.id}|${day}`;
  const cached = priceCache.get(key);
  if (cached !== undefined) return cached;

  let price = computeUsdOrNairaPrice(worldSeed, marketSeed, instrument, day);
  if (instrument.kind === 'crypto') price *= economyOn(worldSeed, day).usdRate;
  const rounded = roundPrice(price);

  if (priceCache.size >= CACHE_LIMIT) priceCache.clear();
  priceCache.set(key, rounded);
  return rounded;
}

/** Relative change between two days (0.05 = +5%). */
export function priceChange(instrumentId: string, fromDay: number, toDay: number, worldSeed: string, marketSeed: string = worldSeed): number {
  const from = priceOn(instrumentId, fromDay, worldSeed, marketSeed);
  const to = priceOn(instrumentId, toDay, worldSeed, marketSeed);
  return from > 0 ? to / from - 1 : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Units & fees
// ---------------------------------------------------------------------------------------------------------------

/** Holdings are stored as integer micro-units (1 unit = 1,000,000 micro-units) so fractions never drift. */
export const MICRO_UNITS_PER_UNIT = 1_000_000;
/** Largest position in any instrument (keeps micro-units far below 2^53). */
export const MAX_UNITS_PER_HOLDING = 1_000_000_000;
export const MIN_ORDER_NAIRA = 1_000;
export const MAX_ORDER_NAIRA = 1_000_000_000;

export const BROKER_FEE_RATES: Readonly<Record<InstrumentKind, number>> = { stock: 0.015, crypto: 0.01 };

/** Broker/exchange fee on a trade's gross value (rounded up — fees never round in the player's favour). */
export function brokerFee(kind: InstrumentKind, gross: number): number {
  return gross <= 0 ? 0 : Math.ceil(gross * BROKER_FEE_RATES[kind]);
}

/** Naira value of a micro-unit position at a price, rounded down (what you'd actually get selling). */
export function positionValue(microUnits: number, price: number): number {
  return Math.floor((microUnits * price) / MICRO_UNITS_PER_UNIT);
}

/** Withholding tax on interest and dividends (10%). */
export function withholdingTax(gross: number): number {
  return gross <= 0 ? 0 : Math.round(gross * WITHHOLDING_TAX_RATE);
}

// ---------------------------------------------------------------------------------------------------------------
// FX (domiciliary USD account, balances in US cents)
// ---------------------------------------------------------------------------------------------------------------

/** The desk buys and sells dollars at the parallel rate ± 2%. */
export const FX_SPREAD = 0.02;
export const FX_SIDES = ['buy-usd', 'sell-usd'] as const;
export type FxSide = (typeof FX_SIDES)[number];

export interface FxRates {
  /** Mid parallel rate, naira per dollar. */
  readonly mid: number;
  /** What you pay per dollar, in kobo (integer, so quotes are exact). */
  readonly buyKobo: number;
  /** What you get per dollar, in kobo. */
  readonly sellKobo: number;
}

export function fxRates(midNairaPerUsd: number): FxRates {
  return {
    mid: midNairaPerUsd,
    buyKobo: Math.round(midNairaPerUsd * 100 * (1 + FX_SPREAD)),
    sellKobo: Math.round(midNairaPerUsd * 100 * (1 - FX_SPREAD)),
  };
}

export interface FxQuote {
  readonly side: FxSide;
  /** US cents moved. */
  readonly usdCents: number;
  /** Naira moved (paid when buying, received when selling). */
  readonly naira: number;
  /** Applied rate in kobo per dollar. */
  readonly rateKobo: number;
}

export type FxAmount = { readonly naira: number } | { readonly usdCents: number };

/**
 * CBN-style FX allowance: dollars (and dollar stablecoins) a character can buy per game month. Bounds what anyone can
 * make by trading the publicly scheduled FX swings.
 */
export const FX_MONTHLY_ALLOWANCE_USD_CENTS = 500_000;

/**
 * Exact integer FX quote. Rounding always favours the desk by less than one unit, so a buy-then-sell round trip can
 * never make money: buying spends `ceil(cents × rate)`, selling pays `floor(cents × rate)`.
 */
export function quoteFx(side: FxSide, amount: FxAmount, midNairaPerUsd: number): FxQuote {
  const rates = fxRates(midNairaPerUsd);
  if (side === 'buy-usd') {
    const rateKobo = rates.buyKobo;
    const usdCents = 'usdCents' in amount ? amount.usdCents : Math.floor((amount.naira * 10_000) / rateKobo);
    return { side, usdCents, naira: Math.ceil((usdCents * rateKobo) / 10_000), rateKobo };
  }
  const rateKobo = rates.sellKobo;
  const usdCents = 'usdCents' in amount ? amount.usdCents : Math.ceil((amount.naira * 10_000) / rateKobo);
  return { side, usdCents, naira: Math.floor((usdCents * rateKobo) / 10_000), rateKobo };
}

// ---------------------------------------------------------------------------------------------------------------
// Fixed income
// ---------------------------------------------------------------------------------------------------------------

export const DEPOSIT_PRODUCT_IDS = ['fixed-deposit', 'tbill', 'money-market'] as const;
export type DepositProductId = (typeof DEPOSIT_PRODUCT_IDS)[number];

export interface DepositProduct {
  readonly id: DepositProductId;
  readonly label: string;
  readonly blurb: string;
  /** Allowed tenors in game days; empty for open-ended products. */
  readonly tenors: readonly number[];
  readonly minAmount: number;
  readonly maxAmount: number;
  /** Share of principal charged when broken before maturity. */
  readonly earlyBreakPenaltyRate: number;
  /** Accrued interest is lost when broken early. */
  readonly forfeitInterestOnBreak: boolean;
}

export const DEPOSIT_PRODUCTS: Readonly<Record<DepositProductId, DepositProduct>> = {
  'fixed-deposit': {
    id: 'fixed-deposit',
    label: 'Fixed deposit',
    blurb: 'Lock money with your bank for a fixed rate. Break early and you lose the interest plus a 1% charge.',
    tenors: [91, 182, 364],
    minAmount: 100_000,
    maxAmount: 500_000_000,
    earlyBreakPenaltyRate: 0.01,
    forfeitInterestOnBreak: true,
  },
  tbill: {
    id: 'tbill',
    label: 'Treasury bill',
    blurb: 'Lend to the Federal Government at the auction stop rate. Selling early costs 0.5% and the interest.',
    tenors: [91, 182, 364],
    minAmount: 100_000,
    maxAmount: 1_000_000_000,
    earlyBreakPenaltyRate: 0.005,
    forfeitInterestOnBreak: true,
  },
  'money-market': {
    id: 'money-market',
    label: 'Money-market fund',
    blurb: 'Daily interest, withdraw anytime. Interest is paid to your wallet at month end.',
    tenors: [],
    minAmount: 5_000,
    maxAmount: 1_000_000_000,
    earlyBreakPenaltyRate: 0,
    forfeitInterestOnBreak: false,
  },
};

/** Shorter tenors pay a little less (upward-sloping yield curve). */
const TENOR_DISCOUNT: Readonly<Record<number, number>> = { 91: 0.015, 182: 0.007, 364: 0 };
/** Banks pay less than the government. */
const FIXED_DEPOSIT_DISCOUNT = 0.01;

/** Annual rate offered for a product and tenor under today's economy, rounded to 0.01%. */
export function depositRate(
  product: DepositProductId,
  tenorDays: number | null,
  economy: Pick<EconomyState, 'tbillRate' | 'moneyMarketRate'>,
): number {
  let rate: number;
  if (product === 'money-market') rate = economy.moneyMarketRate;
  else {
    rate = economy.tbillRate - (TENOR_DISCOUNT[tenorDays ?? 364] ?? 0);
    if (product === 'fixed-deposit') rate -= FIXED_DEPOSIT_DISCOUNT;
  }
  return Math.round(Math.max(0, rate) * 10_000) / 10_000;
}

/** Simple interest over a number of game days on a 360-day year. Fractional; round at payout. */
export function simpleInterest(principal: number, annualRate: number, days: number): number {
  return (principal * annualRate * Math.max(0, days)) / DAYS_PER_YEAR;
}

/** The savings account rate tracks the world economy (`economy.savingsRate`), accrued daily and paid monthly. */
export const SAVINGS_ACCOUNT_LABEL = 'Savings account';
