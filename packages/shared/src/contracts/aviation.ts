/** Private aviation API contracts: the Hangar app. Owned by the aviation domain. */
import type { GameMinute } from '../time/calendar.js';
import type { AircraftClass, AircraftDefinition, GatId } from '../catalog/aviation.js';

export interface AircraftCatalogEntryDto {
  readonly aircraft: AircraftDefinition;
  /** Price today (world price index applied). */
  readonly price: number;
  /** Extra for a remote purchase: the ferry crew flies it to your GAT. */
  readonly ferryFee: number;
  readonly monthly: { readonly hangar: number; readonly maintenance: number; readonly crew: number; readonly total: number };
  /** Fuel for one Lagos ↔ Abuja flight at today's pump price. */
  readonly routeFuelCost: number;
  readonly routeMinutes: number;
  /** You hold the licence this aircraft needs (jets: the hired crew flies it). */
  readonly canFly: boolean;
  /** You are standing at the sales desk (buy in person and park it here today). */
  readonly buyHere: boolean;
}

export interface AircraftFlightOptionDto {
  readonly destination: GatId;
  readonly km: number;
  readonly minutes: number;
  readonly fuelLitres: number;
  readonly fuelCost: number;
  /** The destination airport exists in the world (Abuja opens with the multi-city release). */
  readonly open: boolean;
}

export interface OwnedAircraftDto {
  readonly id: string;
  readonly aircraftId: string;
  readonly name: string;
  readonly aircraftClass: AircraftClass;
  /** The name painted on the fuselage, or null. */
  readonly callName: string | null;
  /** `5N-TOL`. */
  readonly registration: string;
  readonly liveryBase: string;
  readonly liveryAccent: string;
  readonly purchasePrice: number;
  readonly value: number;
  readonly saleOffer: number;
  readonly acquiredAt: GameMinute;
  /** The GAT it is parked at, or is flying/being ferried to. */
  readonly parkedAt: GatId;
  /** In the air or on its ferry flight until this time; null when parked. */
  readonly arrivesAt: GameMinute | null;
  readonly airborne: boolean;
  /** Not allowed to fly until the unpaid bills are settled. */
  readonly grounded: boolean;
  /** Unpaid month-end bills. */
  readonly arrears: number;
  readonly monthly: { readonly hangar: number; readonly maintenance: number; readonly crew: number; readonly total: number };
  readonly liveryFee: number;
  readonly nameFee: number;
  readonly registrationFee: number;
  /** Why you can't fly it right now (shown on the button), or null when you can. */
  readonly flyBlocker: string | null;
  readonly flights: readonly AircraftFlightOptionDto[];
}

export interface PilotTrainingDto {
  readonly licence: boolean;
  readonly enrolled: boolean;
  readonly lessons: number;
  readonly lessonsRequired: number;
  readonly checkRideAttempts: number;
  readonly enrolFee: number;
  readonly lessonFee: number;
  readonly checkRideFee: number;
  /** Your next lesson can start at this time (one a day); null when you can start one now or can't at all. */
  readonly nextLessonAt: GameMinute | null;
  /** A lesson or the check-ride is running until this time. */
  readonly inProgress: 'lesson' | 'check-ride' | null;
  readonly endsAt: GameMinute | null;
  /** You are at the flight school (`mmia-gat`). */
  readonly atSchool: boolean;
  readonly schoolVenueId: string;
  readonly minAge: number;
}

export interface HangarDto {
  readonly catalogue: readonly AircraftCatalogEntryDto[];
  readonly mine: readonly OwnedAircraftDto[];
  readonly training: PilotTrainingDto;
  /** The GAT you are standing in, or null. */
  readonly atGat: GatId | null;
  readonly fleetLimit: number;
}

export interface AircraftPurchaseRequest {
  readonly aircraftId: string;
  /** Remote purchases: where to deliver (ignored when you buy at the desk; defaults to `mmia-gat`). */
  readonly deliverTo?: GatId;
  readonly name?: string;
  readonly registration?: string;
  readonly liveryBase?: string;
  readonly liveryAccent?: string;
  readonly idempotencyKey?: string;
}

export interface AircraftPurchaseResultDto {
  readonly channel: 'in-person' | 'delivery';
  readonly aircraft: OwnedAircraftDto;
  readonly price: number;
  readonly ferryFee: number;
  readonly balance: number;
}

export interface AircraftSaleResultDto {
  readonly aircraftId: string;
  readonly registration: string;
  readonly amount: number;
  /** Unpaid bills settled out of the proceeds. */
  readonly arrearsSettled: number;
  readonly balance: number;
}

export interface AircraftLiveryRequest {
  readonly base: string;
  readonly accent: string;
  readonly idempotencyKey?: string;
}

export interface AircraftNameRequest {
  readonly name: string;
  readonly idempotencyKey?: string;
}

export interface AircraftRegistrationRequest {
  readonly registration: string;
  readonly idempotencyKey?: string;
}

export interface AircraftChangeResultDto {
  readonly aircraft: OwnedAircraftDto;
  readonly fee: number;
  readonly balance: number;
}

export interface AircraftFlightRequest {
  readonly destination: GatId;
  readonly idempotencyKey?: string;
}

export interface AircraftFlightResultDto {
  readonly aircraft: OwnedAircraftDto;
  readonly fuelCost: number;
  readonly minutes: number;
  readonly arrivesAt: GameMinute;
  readonly balance: number;
}

/** Boarding or stepping out of your own parked aircraft: where you stand now (`aircraft:<id>` aboard, else the GAT). */
export interface AircraftBoardingResultDto {
  readonly aircraft: OwnedAircraftDto;
  readonly aboard: boolean;
  readonly locationId: string;
}

export interface AircraftReinstatementResultDto {
  readonly aircraft: OwnedAircraftDto;
  readonly paid: number;
  readonly balance: number;
}

export interface PilotTrainingStepResultDto {
  readonly training: PilotTrainingDto;
  readonly fee: number;
  readonly balance: number;
}

// ----- The apron: other players' planes ---------------------------------------------------------------------------------

/** How you know the owner of a parked plane: a friend, or someone standing in the same terminal. */
export type ApronRelation = 'friend' | 'present';

/** One of other players' planes parked at a General Aviation Terminal (only the owner's public handle is shown). */
export interface ApronPlaneDto {
  /** The aircraft's own id (stable key for drawing). */
  readonly id: string;
  readonly aircraftId: string;
  readonly aircraftClass: AircraftClass;
  readonly liveryBase: string;
  readonly liveryAccent: string;
  readonly callName: string | null;
  readonly registration: string;
  readonly ownerHandle: string;
  readonly relation: ApronRelation;
}

/** `GET /v1/aircraft/apron/:gat` */
export interface ApronDto {
  readonly gat: GatId;
  /** At most `APRON_OTHERS_MAX`: friends' planes first, then those of players in the terminal. */
  readonly planes: readonly ApronPlaneDto[];
  /** Other players' planes parked here that are not drawn: "in a hangar". */
  readonly hangared: number;
}

/** The most other-player planes drawn on one apron. */
export const APRON_OTHERS_MAX = 6;
