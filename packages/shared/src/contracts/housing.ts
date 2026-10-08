/** Housing API contracts — owned by the housing domain. */
import type { GameMinute } from '../time/calendar.js';
import type { DistrictId } from '../catalog/geography.js';
import type {
  BlueprintId,
  ConstructionPaymentPlan,
  HomeOwnership,
  HomePowerBackup,
  HousingTypeId,
  LandTitleId,
  RentQuote,
} from '../catalog/housing.js';

// ----- Requests ----------------------------------------------------------------------------------------------------

export interface RentalListingsQuery {
  readonly districtId?: DistrictId;
  readonly type?: HousingTypeId;
  /** Only show places whose annual rent is at most this. */
  readonly maxRent?: number;
}

export interface SignLeaseRequest {
  /** Listing id from `GET /housing/listings` (valid for the current game week). */
  readonly listingId: string;
}

export interface MoveHomeRequest {
  /** `family` to move back in with your people, or the id of a completed property you own. */
  readonly to: 'family' | string;
}

export interface LandOffersQuery {
  readonly districtId?: DistrictId;
}

export interface BuyLandRequest {
  readonly districtId: DistrictId;
  readonly title: LandTitleId;
  /** 1-4 plots of ~600 sqm (default 1). */
  readonly plots?: number;
}

export interface StartConstructionRequest {
  readonly blueprintId: BlueprintId;
  /** Pay monthly as the contractor hits milestones (default) or everything now for a 5% discount. */
  readonly payment?: ConstructionPaymentPlan;
}

export const TENANCY_ACTIONS = ['let', 'vacate'] as const;
export type TenancyAction = (typeof TENANCY_ACTIONS)[number];

export interface TenancyRequest {
  readonly action: TenancyAction;
}

// ----- Views -------------------------------------------------------------------------------------------------------

export interface RentalListingDto {
  readonly id: string;
  readonly districtId: DistrictId;
  readonly districtName: string;
  readonly type: HousingTypeId;
  readonly typeLabel: string;
  readonly label: string;
  readonly street: string;
  readonly bedrooms: number;
  /** Comfort the place adds (type + area), before furniture and power. */
  readonly comfort: number;
  readonly gridHours: number;
  readonly floodRisk: number;
  readonly features: readonly string[];
  readonly annualRent: number;
  /** Typical rent for this kind of place in this area — compare before you pay. */
  readonly marketRent: number;
  readonly upfront: RentQuote;
  readonly affordable: boolean;
  /** Listings refresh every game week. */
  readonly availableUntil: GameMinute;
}

export interface HomeComfortDto {
  /** From the type of home. */
  readonly home: number;
  readonly area: number;
  readonly furniture: number;
  /** Blackout penalty (≤ 0). */
  readonly power: number;
  /** Net effect on the comfort equilibrium. */
  readonly total: number;
}

export interface HomeDto {
  readonly ownership: HomeOwnership;
  readonly label: string;
  readonly districtId: DistrictId;
  readonly districtName: string;
  readonly typeId: HousingTypeId | null;
  readonly blueprintId: BlueprintId | null;
  readonly bedrooms: number;
  readonly comfort: HomeComfortDto;
  readonly prestige: number;
  /** Multiplier on daily living costs (family discount). */
  readonly livingCostMultiplier: number;
  readonly movedInAt: GameMinute;
  readonly leaseId: string | null;
  readonly propertyId: string | null;
}

export const LEASE_STATUSES = ['active', 'grace', 'notice', 'ended', 'evicted', 'scammed'] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

export interface LeaseDto {
  readonly id: string;
  readonly label: string;
  readonly districtId: DistrictId;
  readonly type: HousingTypeId;
  readonly annualRent: number;
  readonly serviceCharge: number;
  readonly cautionDeposit: number;
  readonly startAt: GameMinute;
  readonly endAt: GameMinute;
  readonly status: LeaseStatus;
  /** Rent for the next term once the landlord has decided (null before then). */
  readonly nextAnnualRent: number | null;
  /** Years the next renewal covers (landlords sometimes want two). */
  readonly renewalYears: number;
  /** What renewal will cost. */
  readonly renewalAmount: number;
  /** You (or the landlord) decided not to renew: you move out at `endAt`. */
  readonly nonRenewing: boolean;
  readonly graceUntil: GameMinute | null;
  readonly evictAt: GameMinute | null;
}

export interface PowerDto {
  readonly gridHours: number;
  readonly gridCollapse: boolean;
  readonly backup: HomePowerBackup;
  readonly fuelled: boolean;
  /** Comfort lost to blackouts today (≥ 0). */
  readonly comfortPenalty: number;
  /** Generator fuel per day at today's pump price (0 without a generator). */
  readonly dailyFuelCost: number;
}

export const DISPUTE_KINDS = ['omonile', 'demolition'] as const;
export type DisputeKind = (typeof DISPUTE_KINDS)[number];

export interface DisputeDto {
  readonly kind: DisputeKind;
  readonly stage: 'open' | 'court';
  readonly openedAt: GameMinute;
  /** Settlement (omonile) or regularisation fee (LASG). */
  readonly demand: number;
  readonly courtUntil: GameMinute | null;
}

export const BUILDING_STATUSES = ['under-construction', 'complete', 'demolished'] as const;
export type BuildingStatus = (typeof BUILDING_STATUSES)[number];
export type Occupancy = 'owner-occupied' | 'let' | 'vacant';

export interface ConstructionDto {
  readonly buildingId: string;
  readonly propertyId: string;
  readonly blueprintId: BlueprintId;
  readonly label: string;
  /** 0-1. */
  readonly progress: number;
  readonly budget: number;
  readonly costPaid: number;
  readonly paymentPlan: ConstructionPaymentPlan;
  readonly startedAt: GameMinute;
  readonly estimatedCompletionAt: GameMinute;
  /** Work stopped until the next milestone is paid. */
  readonly stalled: boolean;
  readonly nextMilestoneAmount: number;
  readonly pendingOverrun: number;
}

export interface BuildingDto {
  readonly id: string;
  readonly blueprintId: BlueprintId;
  readonly label: string;
  readonly status: BuildingStatus;
  readonly value: number;
  /** 0-100: floods, cheap materials and skipped upkeep wear it down. */
  readonly condition: number;
  readonly occupancy: Occupancy | null;
  readonly units: number;
  readonly unitsLet: number;
  /** Rent collected per year from current tenants. */
  readonly annualRentRoll: number;
  readonly nextRentDueAt: GameMinute | null;
  readonly construction: ConstructionDto | null;
}

export interface PropertySaleDto {
  readonly id: string;
  readonly listedAt: GameMinute;
  readonly closesAt: GameMinute;
  readonly askingPrice: number;
  readonly agentRate: number;
}

export interface ValuePointDto {
  readonly t: GameMinute;
  readonly value: number;
}

export const PROPERTY_STATUSES = ['owned', 'selling', 'sold', 'lost'] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export interface PropertyDto {
  readonly id: string;
  readonly label: string;
  readonly districtId: DistrictId;
  readonly districtName: string;
  readonly title: LandTitleId;
  readonly titleLabel: string;
  readonly plots: number;
  readonly sizeSqm: number;
  readonly status: PropertyStatus;
  readonly purchasePrice: number;
  readonly costBasis: number;
  readonly landValue: number;
  readonly buildingValue: number;
  /** Land + building − unpaid land use charge. */
  readonly value: number;
  readonly valueHistory: readonly ValuePointDto[];
  readonly arrears: number;
  readonly dispute: DisputeDto | null;
  readonly titlePerfection: { readonly to: LandTitleId; readonly readyAt: GameMinute; readonly fee: number } | null;
  readonly building: BuildingDto | null;
  readonly sale: PropertySaleDto | null;
  readonly acquiredAt: GameMinute;
}

export interface HousingOverviewDto {
  readonly home: HomeDto;
  readonly lease: LeaseDto | null;
  readonly power: PowerDto;
  readonly family: { readonly districtId: DistrictId; readonly label: string; readonly livingCostMultiplier: number };
  readonly properties: readonly PropertyDto[];
  readonly constructions: readonly ConstructionDto[];
  readonly portfolioValue: number;
}

export interface LandOfferDto {
  readonly districtId: DistrictId;
  readonly districtName: string;
  readonly title: LandTitleId;
  readonly titleLabel: string;
  readonly blurb: string;
  readonly pricePerPlot: number;
  readonly costsPerPlot: { readonly agency: number; readonly legal: number; readonly survey: number; readonly total: number };
  readonly totalPerPlot: number;
  readonly disputeRiskPerYear: number;
  readonly demolitionRiskPerYear: number;
  readonly expectedAppreciation: number;
  readonly floodRisk: number;
  readonly availableUntil: GameMinute;
}

/** Result of any housing command: warm copy for the toast plus the refreshed Homes view. */
export interface HousingActionResultDto {
  readonly outcome: string;
  readonly title: string;
  readonly message: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  readonly housing: HousingOverviewDto;
}
