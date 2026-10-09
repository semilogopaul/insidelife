/**
 * Hosting API contracts — owned by the visits domain: treating guests who are inside your home (food, drinks, cake,
 * take-home packs, goodie bags — spending, never a transfer to the guest) and a guest's thanks. Visits themselves are
 * in social.ts.
 */
import type { HostTreatId, HostTreatKind, TreatServing } from '../catalog/hosting.js';
import type { GameMinute } from '../time/calendar.js';
import type { VisitPersonDto } from './social.js';

/** A guest inside your home right now. */
export interface HostingGuestDto {
  readonly visitId: string;
  readonly person: VisitPersonDto;
  readonly adult: boolean;
}

/** A treat on the menu, priced for the guests inside right now. */
export interface HostTreatOfferDto {
  readonly id: HostTreatId;
  readonly kind: HostTreatKind;
  readonly name: string;
  readonly emoji: string;
  readonly blurb: string;
  readonly per: TreatServing;
  /** ₦ per serving today (world price index applied). */
  readonly unitPrice: number;
  readonly servings: number;
  /** ₦ for everyone inside now. */
  readonly total: number;
  /** Pantry meals it uses (home-cooked), else 0. */
  readonly pantryMeals: number;
  readonly adultsOnly: boolean;
  /** Why it can't be served right now (nobody in, under-18s, pantry short, still on the table…), else null. */
  readonly unavailable: string | null;
}

/** Something on the table right now. */
export interface HomeTreatDto {
  readonly treatId: HostTreatId;
  readonly until: GameMinute;
}

/** The Host sheet: who's in, the menu and what's on the table. */
export interface HostingDto {
  /** You're at home (you can only serve guests in your own house). */
  readonly atHome: boolean;
  readonly guests: readonly HostingGuestDto[];
  readonly menu: readonly HostTreatOfferDto[];
  readonly active: readonly HomeTreatDto[];
  readonly pantryMeals: number;
}

export interface ServeTreatRequest {
  readonly treatId: HostTreatId;
  /** Client-generated (one per tap): a retry with the same key never charges twice. */
  readonly idempotencyKey: string;
}

export interface HostingResultDto {
  readonly treatId: HostTreatId;
  readonly guests: number;
  /** ₦ charged (0 for the pantry pot). */
  readonly total: number;
  readonly balanceAfter: number;
  readonly cloutGained: number;
  /** True when this idempotency key was already used (nothing moved this time). */
  readonly replayed: boolean;
  readonly hosting: HostingDto;
}

/** A treat in a visit: for the guest, what they got; for the host, what they gave this guest. */
export interface VisitTreatDto {
  readonly id: string;
  readonly treatId: HostTreatId;
  readonly name: string;
  readonly emoji: string;
  readonly servedAt: GameMinute;
  readonly thanked: boolean;
}
