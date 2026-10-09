/** Health API contracts — owned by the health domain. */
import type { GameMinute } from '../time/calendar.js';
import type { DistrictId } from '../catalog/geography.js';
import type { ConditionSummaryDto } from './core.js';
import type {
  CareFacilityType,
  TreatmentMethod,
  ConditionKind,
  ConditionSeverity,
  HealthDriftBreakdown,
  HmoPlanId,
  Trimester,
} from '../catalog/health.js';

export type HealthConditionStatus = 'active' | 'recovered' | 'chronic-managed';

export interface SymptomDto {
  readonly description: string;
  /** Energy can't go above this while the condition is active. */
  readonly energyCap: number;
  readonly mood: number;
}

/** What it would cost (and how likely it is to work) to treat a condition at one kind of facility. */
export interface TreatmentQuoteDto {
  readonly facility: CareFacilityType;
  readonly facilityLabel: string;
  readonly available: boolean;
  readonly reason?: string;
  /** Full bill (₦) at today's prices. */
  readonly price: number;
  /** Portion the HMO pays. */
  readonly coveredByHmo: number;
  readonly youPay: number;
  /** Game minutes including the queue. */
  readonly durationMinutes: number;
  /** 0-1. */
  readonly successChance: number;
  /** Days on admission if it works (0 = go home the same day). */
  readonly admissionDays: number;
  /** Ward bill per admitted day, after HMO cover. */
  readonly admissionPerDay: number;
  /** The same treatment as an injection (null where they don't give injections: pharmacies). */
  readonly injection: { readonly price: number; readonly youPay: number; readonly successChance: number } | null;
}

export interface HealthConditionDto extends ConditionSummaryDto {
  readonly status: HealthConditionStatus;
  readonly kind: ConditionKind | 'unknown';
  readonly emoji: string;
  readonly chronic: boolean;
  readonly onsetAt: GameMinute;
  readonly treatedAt: GameMinute | null;
  readonly symptoms: SymptomDto;
  readonly advice: string;
  /** Currently on a hospital ward for this condition. */
  readonly admitted: boolean;
  /** Chronic conditions: medication paid up to (auto-refilled monthly when affordable). */
  readonly managedUntil: GameMinute | null;
  readonly quotes: readonly TreatmentQuoteDto[];
}

export interface HmoPlanDto {
  readonly id: HmoPlanId;
  readonly label: string;
  readonly blurb: string;
  readonly annualPremium: number;
  /** At today's prices. */
  readonly monthlyPremium: number;
  readonly coverage: Readonly<Record<CareFacilityType, number>>;
  readonly annualLimit: number;
  /** Share of a delivery bill covered (0 = maternity excluded). */
  readonly maternityCover: number;
}

export interface HmoMembershipDto {
  readonly id: string;
  readonly planId: HmoPlanId;
  readonly label: string;
  readonly status: 'active' | 'lapsed' | 'cancelled';
  readonly startedAt: GameMinute;
  /** Claims are honoured from this time (waiting period). */
  readonly coveredFrom: GameMinute;
  readonly monthlyPremium: number;
  readonly coverage: Readonly<Record<CareFacilityType, number>>;
  readonly annualLimit: number;
  readonly coverUsedThisYear: number;
}

export interface DeliveryQuoteDto {
  readonly facility: CareFacilityType;
  readonly normal: number;
  readonly cSection: number;
  /** After HMO maternity cover. */
  readonly normalYouPay: number;
  readonly cSectionYouPay: number;
}

export interface PregnancyDto {
  readonly id: string;
  /** `self` = this character is pregnant; `partner` = their partner is. */
  readonly carrier: 'self' | 'partner';
  readonly partnerName: string;
  readonly conceivedAt: GameMinute;
  readonly dueAt: GameMinute;
  readonly trimester: Trimester;
  readonly antenatalVisits: number;
  readonly recommendedVisits: number;
  readonly nextVisitDue: GameMinute | null;
  /** Spotted at an antenatal visit — the hospital is keeping a closer eye. */
  readonly highRisk: boolean;
  readonly plannedFacility: CareFacilityType;
  readonly plannedVenueId: string | null;
  readonly plannedVenueName: string | null;
  readonly deliveryQuotes: readonly DeliveryQuoteDto[];
}

export interface AdmissionDto {
  readonly id: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly reason: string;
  readonly admittedAt: GameMinute;
  readonly dischargeAt: GameMinute;
  /** Ward bill per day after HMO cover. */
  readonly dailyBill: number;
}

export interface CareVenueDto {
  readonly venueId: string;
  readonly name: string;
  readonly districtId: DistrictId;
  readonly open: boolean;
}

export interface FacilityDto {
  readonly type: CareFacilityType;
  readonly label: string;
  readonly blurb: string;
  /** Closest venue of this type to where the character is now. */
  readonly nearest: CareVenueDto | null;
  readonly checkUpPrice: number;
  readonly checkUpYouPay: number;
  readonly checkUpMinutes: number;
  /** Public hospitals during a resident doctors' strike. */
  readonly strike: boolean;
}

export const MEDICAL_RECORD_KINDS = [
  'onset',
  'diagnosis',
  'treatment',
  'treatment-failed',
  'admission',
  'discharge',
  'recovery',
  'check-up',
  'medication',
  'pregnancy',
  'antenatal',
  'birth',
  'insurance',
  'death',
] as const;
export type MedicalRecordKind = (typeof MEDICAL_RECORD_KINDS)[number];

export interface MedicalRecordDto {
  readonly id: string;
  readonly kind: MedicalRecordKind;
  readonly summary: string;
  readonly cost: number;
  readonly venueName: string | null;
  readonly gameMinute: GameMinute;
}

export interface HealthHereDto {
  readonly venueId: string;
  readonly venueName: string;
  readonly facility: CareFacilityType;
  readonly open: boolean;
}

/** GET /v1/health — the Health app. */
export interface HealthViewDto {
  readonly asOf: GameMinute;
  readonly health: number;
  readonly healthLabel: string;
  readonly fitness: number;
  readonly mood: number;
  /** Energy ceiling from the worst active symptom. */
  readonly energyCap: number;
  /** Yesterday's health change, explained. */
  readonly drift: HealthDriftBreakdown;
  readonly conditions: readonly HealthConditionDto[];
  readonly admission: AdmissionDto | null;
  readonly insurance: HmoMembershipDto | null;
  readonly plans: readonly HmoPlanDto[];
  readonly pregnancy: PregnancyDto | null;
  readonly facilities: readonly FacilityDto[];
  /** Set when the character is inside a pharmacy or hospital right now. */
  readonly here: HealthHereDto | null;
  readonly doctorsStrike: boolean;
  readonly history: readonly MedicalRecordDto[];
}

/** POST /v1/health/treatments — `conditionId` is a condition's `id` from GET /v1/health (or its catalog id once diagnosed). */
export interface StartTreatmentRequest {
  readonly conditionId: string;
  /** Tablets by default; `injection` at hospitals. */
  readonly method?: TreatmentMethod;
}

export interface TreatmentStartedDto {
  readonly conditionId: string;
  readonly label: string;
  readonly severity: ConditionSeverity;
  readonly facility: CareFacilityType;
  readonly venueName: string;
  readonly price: number;
  readonly coveredByHmo: number;
  readonly paid: number;
  readonly durationMinutes: number;
  readonly endsAt: GameMinute;
  readonly successChance: number;
  readonly message: string;
}

export interface TreatmentResponseDto {
  readonly treatment: TreatmentStartedDto;
  readonly health: HealthViewDto;
}

export interface CheckUpFindingDto {
  readonly conditionId: string;
  readonly label: string;
  readonly severity: ConditionSeverity;
  readonly newlyDiagnosed: boolean;
  readonly advice: string;
}

export interface CheckUpResultDto {
  readonly facility: CareFacilityType;
  readonly venueName: string;
  readonly price: number;
  readonly coveredByHmo: number;
  readonly paid: number;
  readonly durationMinutes: number;
  readonly findings: readonly CheckUpFindingDto[];
  /** Symptoms this facility couldn't explain (e.g. a pharmacy can't test for typhoid). */
  readonly unexplained: number;
  readonly message: string;
}

export interface CheckUpResponseDto {
  readonly checkUp: CheckUpResultDto;
  readonly health: HealthViewDto;
}

/** POST /v1/health/insurance */
export interface JoinHmoRequest {
  readonly planId: HmoPlanId;
}
