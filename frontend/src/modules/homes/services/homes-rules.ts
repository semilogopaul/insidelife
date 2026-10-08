import {
  SCAM_PRICE_THRESHOLD,
  type DistrictId,
  type HomeComfortDto,
  type HousingOverviewDto,
  type HousingTypeId,
  type LandOfferDto,
  type RentQuote,
  type RentalListingDto,
} from '@insidelife/shared';
import type { ReceiptLine } from '@/common/components';

// ----- Rent --------------------------------------------------------------------------------------------------------

/** Everything due on day one, Lagos-style: a year upfront + agency 10% + legal 10% + caution 10% (+ extras). */
export function upfrontLines(quote: RentQuote): { readonly lines: ReceiptLine[]; readonly total: number } {
  const lines: ReceiptLine[] = [
    { label: 'Rent (1 year upfront)', amount: quote.rent },
    { label: 'Agency fee (10%)', amount: quote.agency },
    { label: 'Legal fee (10%)', amount: quote.legal },
    { label: 'Caution deposit (10%)', amount: quote.caution, note: 'Refundable when you move out' },
  ];
  if (quote.serviceCharge > 0)
    lines.push({
      label: 'Service charge',
      amount: quote.serviceCharge,
      note: 'Estate security, water, cleaning',
    });
  if (quote.inspectionFee > 0)
    lines.push({ label: 'Inspection fee', amount: quote.inspectionFee, note: 'Paid to the agent to view' });
  return { lines, total: quote.total };
}

/** −0.12 = 12% below the going rate for this kind of place in this area. */
export function vsMarket(listing: Pick<RentalListingDto, 'annualRent' | 'marketRent'>): number {
  if (listing.marketRent <= 0) return 0;
  return listing.annualRent / listing.marketRent - 1;
}

/** "Too good to be true": priced at least 10% under market — the agent might vanish with the inspection fee. */
export function looksSuspicious(listing: Pick<RentalListingDto, 'annualRent' | 'marketRent'>): boolean {
  return vsMarket(listing) <= SCAM_PRICE_THRESHOLD + 1e-9;
}

/** "12% below market", "5% above market", "At market rate". */
export function marketLabel(listing: Pick<RentalListingDto, 'annualRent' | 'marketRent'>): string {
  const delta = Math.round(vsMarket(listing) * 100);
  if (delta === 0) return 'At market rate';
  return delta < 0 ? `${-delta}% below market` : `${delta}% above market`;
}

export interface ListingFilter {
  readonly district: DistrictId | 'all';
  readonly type: HousingTypeId | 'all';
  readonly affordableOnly: boolean;
}

/** Filter by district/type/affordability, cheapest upfront first. */
export function filterListings<
  T extends Pick<RentalListingDto, 'districtId' | 'type' | 'affordable' | 'upfront'>,
>(listings: readonly T[], filter: ListingFilter): T[] {
  return listings
    .filter(
      (listing) =>
        (filter.district === 'all' || listing.districtId === filter.district) &&
        (filter.type === 'all' || listing.type === filter.type) &&
        (!filter.affordableOnly || listing.affordable),
    )
    .sort((a, b) => a.upfront.total - b.upfront.total);
}

// ----- Land --------------------------------------------------------------------------------------------------------

/** Price, agency, legal and survey for `plots` plots of one offer. */
export function landLines(
  offer: Pick<LandOfferDto, 'pricePerPlot' | 'costsPerPlot' | 'totalPerPlot'>,
  plots: number,
): { readonly lines: ReceiptLine[]; readonly total: number } {
  const n = Math.max(1, Math.floor(plots));
  return {
    lines: [
      { label: n === 1 ? 'Land (1 plot)' : `Land (${n} plots)`, amount: offer.pricePerPlot * n },
      { label: 'Agency fee', amount: offer.costsPerPlot.agency * n },
      { label: 'Legal fee', amount: offer.costsPerPlot.legal * n },
      { label: 'Survey plan', amount: offer.costsPerPlot.survey * n },
    ],
    total: offer.totalPerPlot * n,
  };
}

/** "1 in 50 chance a year" — risk said the way people weigh it. */
export function oddsPerYear(chance: number): string {
  if (chance <= 0) return 'No known risk';
  if (chance >= 0.5) return `${Math.round(chance * 100)}% chance a year`;
  return `About 1 in ${Math.max(2, Math.round(1 / chance))} a year`;
}

// ----- Building ----------------------------------------------------------------------------------------------------

export interface Milestone {
  readonly label: string;
  /** Progress (0-1) at which it's done. */
  readonly at: number;
  readonly done: boolean;
}

const MILESTONES: ReadonlyArray<readonly [string, number]> = [
  ['Foundation', 0.2],
  ['Blocks to lintel', 0.45],
  ['Roofing', 0.7],
  ['Finishing', 1],
];

/** Site milestones the contractor reports against (by progress 0-1). */
export function constructionMilestones(progress: number): Milestone[] {
  return MILESTONES.map(([label, at]) => ({ label, at, done: progress >= at - 1e-9 }));
}

// ----- Comfort -----------------------------------------------------------------------------------------------------

export interface ComfortRow {
  readonly key: keyof Omit<HomeComfortDto, 'total'>;
  readonly label: string;
  readonly value: number;
}

/** The parts of home comfort, in the order people think about them. */
export function comfortRows(comfort: HomeComfortDto): ComfortRow[] {
  return [
    { key: 'home', label: 'The place itself', value: comfort.home },
    { key: 'area', label: 'The area', value: comfort.area },
    { key: 'furniture', label: 'Furniture & appliances', value: comfort.furniture },
    { key: 'power', label: 'NEPA blackouts', value: comfort.power },
  ];
}

// ----- Next step -----------------------------------------------------------------------------------------------------

export type HomeNextStep =
  | { readonly kind: 'rent-overdue' }
  | { readonly kind: 'quit-notice' }
  | { readonly kind: 'renewal' }
  | { readonly kind: 'power' }
  | { readonly kind: 'move-out' }
  | null;

const RENEWAL_WINDOW_MINUTES = 60 * 24 * 60;

/** What the Homes app should nudge first (or nothing). */
export function homeNextStep(
  overview: Pick<HousingOverviewDto, 'home' | 'lease' | 'power'>,
  now: number,
): HomeNextStep {
  const lease = overview.lease;
  if (lease?.status === 'grace') return { kind: 'rent-overdue' };
  if (lease?.status === 'notice') return { kind: 'quit-notice' };
  if (lease && lease.status === 'active' && !lease.nonRenewing && lease.endAt - now <= RENEWAL_WINDOW_MINUTES)
    return { kind: 'renewal' };
  if (overview.home.ownership === 'family') return { kind: 'move-out' };
  if (overview.power.backup === 'none' && overview.power.comfortPenalty >= 4) return { kind: 'power' };
  return null;
}
