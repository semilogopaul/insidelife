import type { GameMinute } from '../time/calendar.js';
import type { DistrictId } from '../catalog/geography.js';
import type { BusinessCategory, BusinessRisk, BusinessTrait } from '../catalog/businesses.js';

/**
 * Businesses API contracts — owned by the businesses domain.
 *
 * GET    /v1/businesses                 → BusinessesViewDto
 * POST   /v1/businesses                 → OwnedBusinessDto        (body: StartBusinessRequest)
 * POST   /v1/businesses/:id/expansions  → OwnedBusinessDto
 * POST   /v1/businesses/:id/sale        → BusinessExitDto
 * DELETE /v1/businesses/:id             → BusinessExitDto
 */

export interface BusinessTypeDto {
  readonly id: string;
  readonly label: string;
  readonly emoji: string;
  readonly category: BusinessCategory;
  readonly blurb: string;
  /** Start-up capital at today's prices. */
  readonly capital: number;
  readonly expansion: { readonly label: string; readonly cost: number; readonly maxUnits: number };
  /** Typical monthly profit for one unit in a good district, at today's prices (rough, before luck). */
  readonly typicalMonthlyProfit: { readonly low: number; readonly high: number };
  readonly risk: BusinessRisk;
  readonly allowedDistricts: readonly DistrictId[] | null;
  /** Owner traits that matter, strongest first. */
  readonly keyTraits: readonly BusinessTrait[];
  readonly managementHours: number;
  readonly minAge: number;
  readonly affordable: boolean;
}

export interface BusinessPnlDto {
  readonly monthIndex: number;
  readonly revenue: number;
  readonly costs: number;
  readonly eventCosts: number;
  readonly tax: number;
  /** Profit after costs and tax (negative = loss). */
  readonly profit: number;
  /** What reached (or left) your pocket after debt repayments. */
  readonly ownerCashFlow: number;
  readonly debtAfter: number;
  readonly notes: readonly string[];
}

export const BUSINESS_STATUSES = ['active', 'sold', 'closed', 'folded'] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

export interface OwnedBusinessDto {
  readonly id: string;
  readonly typeId: string;
  readonly name: string;
  readonly label: string;
  readonly emoji: string;
  readonly districtId: DistrictId;
  readonly units: number;
  readonly maxUnits: number;
  /** Cost of the next expansion at today's prices (null at max size). */
  readonly expansionCost: number | null;
  readonly expansionLabel: string;
  readonly investedCapital: number;
  readonly openedAt: GameMinute;
  readonly status: BusinessStatus;
  /** Unpaid supplier debts the business is carrying. */
  readonly debt: number;
  readonly managementHoursThisMonth: number;
  readonly managementHoursTarget: number;
  /** Startups: traction multiplier (1 = launch). */
  readonly traction: number | null;
  readonly trailingAnnualProfit: number;
  /** What it adds to your net worth. */
  readonly valuation: number;
  /** What a buyer would pay today (range). */
  readonly saleEstimate: { readonly low: number; readonly high: number };
  readonly recentPnl: readonly BusinessPnlDto[];
}

export interface BusinessesViewDto {
  readonly catalogue: readonly BusinessTypeDto[];
  readonly mine: readonly OwnedBusinessDto[];
  readonly maxBusinesses: number;
}

export interface StartBusinessRequest {
  readonly typeId: string;
  /** 2-40 characters: "Mama Put Deluxe", "Eko Swift Logistics". */
  readonly name: string;
  readonly districtId: DistrictId;
}

export interface BusinessExitDto {
  readonly businessId: string;
  /** Cash that reached your wallet. */
  readonly proceeds: number;
  /** Debts settled out of the proceeds or your pocket. */
  readonly debtSettled: number;
  readonly message: string;
}
