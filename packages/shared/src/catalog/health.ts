/**
 * Health catalog — owned by the health domain.
 *
 * Conditions (with untreated progression tables), care facilities (pharmacy, public and private hospitals), HMO plans,
 * pregnancy, the daily health-drift formula and the mortality curve. Everything here is pure so the server (which is
 * authoritative) and the client (which previews quotes and explains drift) compute identical numbers.
 *
 * Calibration (Lagos, 2026): GP visit ₦20-25k; malaria episode ₦7-17k at a general hospital; private C-section
 * ₦0.3-1.5m; HMO basic ₦30-80k/yr … executive ₦600k+; ~68.5m malaria cases/yr nationally; hypertension in 31-40% of
 * adults. See docs/research/nigeria-economy-2026.md.
 */
import type { NeedKey } from '../needs/needs.js';
import type { LifestyleTier } from './life.js';
import type { TransportMode } from './transport.js';
import type { VenueType } from './venues.js';
import { rngFor } from '../random/rng.js';
import {
  DAYS_PER_YEAR,
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  fromDateParts,
  toDateParts,
  type GameMinute,
  type Season,
} from '../time/calendar.js';

// ---------------------------------------------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------------------------------------------

export const CONDITION_SEVERITIES = ['mild', 'moderate', 'severe', 'critical'] as const;
export type ConditionSeverity = (typeof CONDITION_SEVERITIES)[number];

export const SEVERITY_LABELS: Readonly<Record<ConditionSeverity, string>> = {
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
  critical: 'Critical',
};

export function severityRank(severity: ConditionSeverity): number {
  return CONDITION_SEVERITIES.indexOf(severity);
}

/** One step worse, or null when already critical. */
export function worseSeverity(severity: ConditionSeverity): ConditionSeverity | null {
  return CONDITION_SEVERITIES[severityRank(severity) + 1] ?? null;
}

/** One step better, or null when already mild. */
export function milderSeverity(severity: ConditionSeverity): ConditionSeverity | null {
  const rank = severityRank(severity);
  return rank > 0 ? (CONDITION_SEVERITIES[rank - 1] ?? null) : null;
}

export function isSeverity(value: string): value is ConditionSeverity {
  return (CONDITION_SEVERITIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------------------------------------------

export const CONDITION_IDS = [
  'malaria',
  'typhoid',
  'catarrh',
  'food-poisoning',
  'hypertension',
  'diabetes',
  'injury',
  'burnout',
  'pregnancy',
] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

export function isConditionId(value: string): value is ConditionId {
  return (CONDITION_IDS as readonly string[]).includes(value);
}

export type ConditionKind = 'infection' | 'chronic' | 'injury' | 'mental' | 'pregnancy';

/** What a condition does to the character at one severity. */
export interface ConditionSymptoms {
  /** What the player feels (shown even before a diagnosis). */
  readonly description: string;
  /** Maximum energy while this is active (100 = no cap). The worst active symptom wins. */
  readonly energyCap: number;
  /** Mood modifier while active (negative hurts; pregnancy's second trimester is positive). */
  readonly mood: number;
  /** Health lost per game day at this severity (the body's own recovery still applies). */
  readonly healthPerDay: number;
  /** Need changes applied once per game day (loss of appetite, broken sleep). */
  readonly needs?: Readonly<Partial<Record<NeedKey, number>>>;
}

export type SeverityTable<T> = Readonly<Record<ConditionSeverity, T>>;

export interface ConditionDefinition {
  readonly id: ConditionId;
  readonly label: string;
  readonly emoji: string;
  readonly kind: ConditionKind;
  /** Chronic conditions never clear; treatment manages them with monthly medication. */
  readonly chronic: boolean;
  /** Nothing in the game spreads person-to-person (yet). */
  readonly contagious: 'none';
  /** Can an untreated critical case end a life? (Burnout and pregnancy never do.) */
  readonly canBeFatal: boolean;
  /** Obvious conditions (a broken arm, a pregnancy) are diagnosed the moment they start. */
  readonly obvious: boolean;
  readonly blurb: string;
  /** What to do about it, in plain words. */
  readonly advice: string;
  /** Shown instead of the name until a professional diagnoses it. */
  readonly undiagnosedLabel: string;
  readonly symptoms: SeverityTable<ConditionSymptoms>;
  /** Symptoms while a chronic condition is controlled with medication. */
  readonly managedSymptoms?: ConditionSymptoms;
  /** Untreated: daily chance of getting one step worse (critical has nowhere further to go). */
  readonly worsenPerDay: SeverityTable<number>;
  /** Untreated: daily chance the body fights it off by itself (0 for chronic conditions). */
  readonly recoverPerDay: SeverityTable<number>;
  /** Most severe level a pharmacy can sensibly handle; beyond it self-medication rarely works. Null: never. */
  readonly pharmacyLimit: ConditionSeverity | null;
  /** A pharmacy test (malaria RDT, BP cuff, glucometer) can diagnose it. */
  readonly pharmacyDiagnosable: boolean;
  /** Multiplier on the facility's base treatment price. */
  readonly costFactor: number;
  /** Days on admission after successful hospital treatment, by severity (0 = outpatient). */
  readonly admissionDays: SeverityTable<number>;
  /** Monthly medication cost (₦, before the price index) to keep a chronic condition controlled. */
  readonly monthlyMedication?: number;
  /** Respectful cause of death if it ever proves fatal. */
  readonly causeOfDeath: string;
}

const table = <T>(mild: T, moderate: T, severe: T, critical: T): SeverityTable<T> => ({ mild, moderate, severe, critical });
const symptom = (
  description: string,
  energyCap: number,
  mood: number,
  healthPerDay: number,
  needs?: Partial<Record<NeedKey, number>>,
): ConditionSymptoms => (needs ? { description, energyCap, mood, healthPerDay, needs } : { description, energyCap, mood, healthPerDay });

export const CONDITIONS: Readonly<Record<ConditionId, ConditionDefinition>> = {
  malaria: {
    id: 'malaria',
    label: 'Malaria',
    emoji: '🦟',
    kind: 'infection',
    chronic: false,
    contagious: 'none',
    canBeFatal: true,
    obvious: false,
    blurb: 'Lagos’ most faithful visitor, especially when the rains come.',
    advice: 'Mild malaria clears with proper ACT drugs from a registered pharmacy. If the fever climbs, go to hospital.',
    undiagnosedLabel: 'Fever and body pains',
    symptoms: table(
      symptom('Headache, slight fever, body dey do somehow', 75, -6, 0.5, { hunger: -5 }),
      symptom('High fever, chills and a bitter mouth', 55, -12, 1.5, { hunger: -10, fun: -8 }),
      symptom('Burning fever and vomiting — you can barely stand', 35, -20, 4, { hunger: -18, fun: -12 }),
      symptom('Confusion and convulsions — this is severe malaria', 15, -30, 14, { hunger: -25 }),
    ),
    worsenPerDay: table(0.22, 0.18, 0.15, 0),
    recoverPerDay: table(0.15, 0.05, 0.01, 0),
    pharmacyLimit: 'mild',
    pharmacyDiagnosable: true,
    costFactor: 1,
    admissionDays: table(0, 0, 3, 6),
    causeOfDeath: 'Complications of severe malaria',
  },
  typhoid: {
    id: 'typhoid',
    label: 'Typhoid fever',
    emoji: '🤒',
    kind: 'infection',
    chronic: false,
    contagious: 'none',
    canBeFatal: true,
    obvious: false,
    blurb: 'From contaminated food or water. Slow to start, stubborn to leave.',
    advice: 'Typhoid needs proper antibiotics and a real test — a hospital is the safe bet. Drink clean water.',
    undiagnosedLabel: 'Stomach pain and a fever that won’t go',
    symptoms: table(
      symptom('Stomach ache and a low fever that won’t go', 80, -5, 0.6),
      symptom('Persistent fever, weakness, no appetite', 55, -12, 1.8, { hunger: -10 }),
      symptom('High fever, belly pain and dehydration', 35, -20, 4.5, { hunger: -18 }),
      symptom('Intestinal complications — you need surgery-level care', 15, -30, 13, { hunger: -25 }),
    ),
    worsenPerDay: table(0.12, 0.12, 0.1, 0),
    recoverPerDay: table(0.06, 0.03, 0.005, 0),
    pharmacyLimit: 'mild',
    pharmacyDiagnosable: false,
    costFactor: 1.25,
    admissionDays: table(0, 0, 5, 8),
    causeOfDeath: 'Complications of typhoid fever',
  },
  catarrh: {
    id: 'catarrh',
    label: 'Catarrh (cold)',
    emoji: '🤧',
    kind: 'infection',
    chronic: false,
    contagious: 'none',
    canBeFatal: true,
    obvious: false,
    blurb: 'Harmattan dust and rainy-season chills. Usually harmless.',
    advice: 'Rest, warm fluids and a pharmacy remedy sort it out. A cough with fever needs a doctor.',
    undiagnosedLabel: 'Runny nose and sneezing',
    symptoms: table(
      symptom('Runny nose and sneezing', 90, -3, 0.1),
      symptom('Blocked nose, sore throat and headache', 75, -6, 0.4),
      symptom('Chest infection — coughing and fever', 55, -12, 2, { fun: -6 }),
      symptom('Pneumonia — struggling to breathe', 25, -25, 10, { hunger: -15 }),
    ),
    worsenPerDay: table(0.06, 0.05, 0.08, 0),
    recoverPerDay: table(0.3, 0.15, 0.03, 0),
    pharmacyLimit: 'moderate',
    pharmacyDiagnosable: true,
    costFactor: 0.6,
    admissionDays: table(0, 0, 2, 6),
    causeOfDeath: 'Pneumonia',
  },
  'food-poisoning': {
    id: 'food-poisoning',
    label: 'Food poisoning',
    emoji: '🤢',
    kind: 'infection',
    chronic: false,
    contagious: 'none',
    canBeFatal: true,
    obvious: false,
    blurb: 'That roadside jollof had other plans.',
    advice: 'ORS, water and rest. If you can’t keep fluids down, go to hospital before you dehydrate.',
    undiagnosedLabel: 'Running stomach',
    symptoms: table(
      symptom('Running stomach', 70, -8, 0.4, { hunger: -15 }),
      symptom('Vomiting and diarrhoea', 45, -15, 2, { hunger: -25, hygiene: -10 }),
      symptom('Severe dehydration — dizzy and weak', 25, -22, 6, { hunger: -30, hygiene: -15 }),
      symptom('Shock from dehydration', 10, -30, 15, { hunger: -35 }),
    ),
    worsenPerDay: table(0.12, 0.12, 0.15, 0),
    recoverPerDay: table(0.45, 0.3, 0.05, 0),
    pharmacyLimit: 'moderate',
    pharmacyDiagnosable: true,
    costFactor: 0.7,
    admissionDays: table(0, 0, 2, 4),
    causeOfDeath: 'Severe dehydration',
  },
  hypertension: {
    id: 'hypertension',
    label: 'High blood pressure',
    emoji: '🫀',
    kind: 'chronic',
    chronic: true,
    contagious: 'none',
    canBeFatal: true,
    obvious: false,
    blurb: 'The silent killer — a third of Nigerian adults have it, most don’t know.',
    advice: 'Check your BP regularly, take your tablets every day, cut the salt and Maggi, and keep moving.',
    undiagnosedLabel: 'Occasional headaches',
    symptoms: table(
      symptom('No symptoms — that’s what makes it dangerous', 100, 0, 0.15),
      symptom('Headaches and dizzy spells', 85, -4, 0.4),
      symptom('Pounding headaches and blurred vision', 65, -10, 1.5),
      symptom('Hypertensive crisis — stroke risk', 20, -25, 12),
    ),
    managedSymptoms: symptom('Controlled with daily tablets', 100, -1, 0.03),
    worsenPerDay: table(0.006, 0.005, 0.012, 0),
    recoverPerDay: table(0, 0, 0, 0),
    pharmacyLimit: 'moderate',
    pharmacyDiagnosable: true,
    costFactor: 0.8,
    admissionDays: table(0, 0, 2, 7),
    monthlyMedication: 9_000,
    causeOfDeath: 'Stroke from uncontrolled high blood pressure',
  },
  diabetes: {
    id: 'diabetes',
    label: 'Type 2 diabetes',
    emoji: '🩸',
    kind: 'chronic',
    chronic: true,
    contagious: 'none',
    canBeFatal: true,
    obvious: false,
    blurb: 'Sugar in the blood that won’t behave. Age, weight and too much swallow help it along.',
    advice: 'Daily medication, fewer sugary drinks and a glucometer. Exercise helps a lot.',
    undiagnosedLabel: 'Always thirsty, always tired',
    symptoms: table(
      symptom('Always thirsty, waking up at night to wee', 95, -1, 0.15),
      symptom('Tired all the time, blurry eyes', 80, -5, 0.5),
      symptom('Wounds that won’t heal, numb feet', 60, -10, 1.8),
      symptom('Diabetic emergency', 15, -25, 12, { hunger: -20 }),
    ),
    managedSymptoms: symptom('Controlled with medication and diet', 95, -2, 0.05),
    worsenPerDay: table(0.005, 0.004, 0.01, 0),
    recoverPerDay: table(0, 0, 0, 0),
    pharmacyLimit: 'moderate',
    pharmacyDiagnosable: true,
    costFactor: 1.1,
    admissionDays: table(0, 0, 3, 8),
    monthlyMedication: 22_000,
    causeOfDeath: 'Complications of diabetes',
  },
  injury: {
    id: 'injury',
    label: 'Injury',
    emoji: '🩹',
    kind: 'injury',
    chronic: false,
    contagious: 'none',
    canBeFatal: true,
    obvious: true,
    blurb: 'Okada skids, danfo doors, gym ego lifts.',
    advice: 'Clean and dress small wounds. Anything broken, or a knock to the head, needs a hospital.',
    undiagnosedLabel: 'Injury',
    symptoms: table(
      symptom('Bruises and a sprain', 85, -5, 0.3, { fun: -5 }),
      symptom('Deep cuts and a twisted ankle', 65, -10, 1, { fun: -8 }),
      symptom('Broken bones', 40, -18, 3, { fun: -12 }),
      symptom('Serious head or internal injury', 10, -30, 16),
    ),
    worsenPerDay: table(0.05, 0.08, 0.15, 0),
    recoverPerDay: table(0.2, 0.06, 0.01, 0),
    pharmacyLimit: 'mild',
    pharmacyDiagnosable: true,
    costFactor: 1.4,
    admissionDays: table(0, 1, 5, 10),
    causeOfDeath: 'Complications of serious injuries',
  },
  burnout: {
    id: 'burnout',
    label: 'Burnout',
    emoji: '🫠',
    kind: 'mental',
    chronic: false,
    contagious: 'none',
    canBeFatal: false,
    obvious: false,
    blurb: 'Lagos hustle, Lagos traffic, Lagos landlord. Something had to give.',
    advice: 'A doctor can sign you off and set a recovery plan. Sleep, see friends, take a break — you matter more than the job.',
    undiagnosedLabel: 'Tired of everything',
    symptoms: table(
      symptom('Tired, irritable, can’t switch off', 80, -8, 0.2),
      symptom('Exhausted, headaches, dreading work', 60, -15, 0.6, { fun: -6 }),
      symptom('Total exhaustion — getting out of bed is a fight', 40, -25, 1.5, { fun: -10, social: -8 }),
      symptom('Your body and mind have had enough', 25, -35, 4, { fun: -12, social: -12 }),
    ),
    worsenPerDay: table(0.08, 0.06, 0.04, 0),
    recoverPerDay: table(0.06, 0.03, 0.01, 0.005),
    pharmacyLimit: null,
    pharmacyDiagnosable: false,
    costFactor: 0.8,
    admissionDays: table(0, 0, 0, 3),
    causeOfDeath: 'Exhaustion',
  },
  pregnancy: {
    id: 'pregnancy',
    label: 'Pregnancy',
    emoji: '🤰',
    kind: 'pregnancy',
    chronic: false,
    contagious: 'none',
    canBeFatal: false,
    obvious: true,
    blurb: 'A whole new person on the way. Congratulations!',
    advice: 'Book antenatal visits at a hospital, eat well and rest. Plan where you’ll deliver.',
    undiagnosedLabel: 'Pregnancy',
    // Pregnancy symptoms follow the trimester (see PREGNANCY_TRIMESTERS); this table is the neutral fallback.
    symptoms: table(
      symptom('Expecting', 85, 0, 0),
      symptom('Expecting', 85, 0, 0),
      symptom('Expecting', 85, 0, 0),
      symptom('Expecting', 85, 0, 0),
    ),
    worsenPerDay: table(0, 0, 0, 0),
    recoverPerDay: table(0, 0, 0, 0),
    pharmacyLimit: null,
    pharmacyDiagnosable: false,
    costFactor: 1,
    admissionDays: table(0, 0, 0, 0),
    causeOfDeath: 'Complications of pregnancy',
  },
};

export function findCondition(id: string): ConditionDefinition | undefined {
  return isConditionId(id) ? CONDITIONS[id] : undefined;
}

/** Symptoms for a condition at a severity, accounting for chronic conditions under control. */
export function symptomsFor(condition: ConditionDefinition, severity: ConditionSeverity, managed: boolean): ConditionSymptoms {
  return managed && condition.managedSymptoms ? condition.managedSymptoms : condition.symptoms[severity];
}

// ---------------------------------------------------------------------------------------------------------------
// Care facilities (venue types)
// ---------------------------------------------------------------------------------------------------------------

export const CARE_FACILITY_TYPES = ['pharmacy', 'hospital-public', 'hospital-private'] as const satisfies readonly VenueType[];
export type CareFacilityType = (typeof CARE_FACILITY_TYPES)[number];

export function isCareFacility(type: string): type is CareFacilityType {
  return (CARE_FACILITY_TYPES as readonly string[]).includes(type);
}

export interface DeliveryPrices {
  readonly normal: number;
  readonly cSection: number;
  /** Share of uncomplicated births that still end in a C-section at this tier. */
  readonly cSectionRate: number;
}

export interface FacilityDefinition {
  readonly type: CareFacilityType;
  readonly label: string;
  readonly blurb: string;
  /** Base treatment price by severity (₦, before the condition factor and price index). Null: can't treat it. */
  readonly price: SeverityTable<number | null>;
  /** Chance a treatment works, by severity (before condition-specific limits). */
  readonly success: SeverityTable<number>;
  /** Game minutes from walking in to walking out (queue + consultation), by severity. */
  readonly visitMinutes: SeverityTable<number>;
  readonly checkUpPrice: number;
  readonly checkUpMinutes: number;
  /** Ward bed per day (₦); null where nobody gets admitted. */
  readonly admissionPerDay: number | null;
  /** Chance the drugs are fake or substandard (the treatment silently fails). */
  readonly fakeDrugRisk: number;
  /** Health regained per day on admission (nursing care, drips, proper food). */
  readonly careQuality: number;
  readonly delivery: DeliveryPrices | null;
  readonly antenatalPrice: number | null;
  readonly antenatalMinutes: number;
}

export const FACILITIES: Readonly<Record<CareFacilityType, FacilityDefinition>> = {
  pharmacy: {
    type: 'pharmacy',
    label: 'Pharmacy (self-medication)',
    blurb: 'Quick and cheap. Fine for mild malaria and catarrh — and watch out for fake drugs.',
    price: table(3_000, 7_500, 11_000, null),
    success: table(0.78, 0.55, 0.2, 0),
    visitMinutes: table(15, 15, 15, 15),
    checkUpPrice: 3_000,
    checkUpMinutes: 15,
    admissionPerDay: null,
    fakeDrugRisk: 0.12,
    careQuality: 0,
    delivery: null,
    antenatalPrice: null,
    antenatalMinutes: 0,
  },
  'hospital-public': {
    type: 'hospital-public',
    label: 'Public hospital',
    blurb: 'Cheap and decent — if you have the patience for the queue.',
    price: table(12_000, 30_000, 120_000, 380_000),
    success: table(0.92, 0.85, 0.72, 0.52),
    visitMinutes: table(60, 90, 120, 120),
    checkUpPrice: 10_000,
    checkUpMinutes: 90,
    admissionPerDay: 15_000,
    fakeDrugRisk: 0.01,
    careQuality: 1.2,
    delivery: { normal: 90_000, cSection: 380_000, cSectionRate: 0.12 },
    antenatalPrice: 6_000,
    antenatalMinutes: 120,
  },
  'hospital-private': {
    type: 'hospital-private',
    label: 'Private hospital',
    blurb: 'Fast, clean and the best care money can buy in Lagos. The bill will humble you.',
    price: table(35_000, 95_000, 420_000, 1_500_000),
    success: table(0.97, 0.94, 0.87, 0.7),
    visitMinutes: table(30, 30, 60, 60),
    checkUpPrice: 30_000,
    checkUpMinutes: 30,
    admissionPerDay: 90_000,
    fakeDrugRisk: 0,
    careQuality: 2.5,
    delivery: { normal: 450_000, cSection: 1_300_000, cSectionRate: 0.25 },
    antenatalPrice: 25_000,
    antenatalMinutes: 30,
  },
};

/** Public-hospital queues double and outcomes slip while resident doctors are on strike. */
export const STRIKE_WAIT_MULTIPLIER = 2;
export const STRIKE_SUCCESS_MULTIPLIER = 0.85;
/** Self-medication beyond what a pharmacy can handle rarely works. */
export const PHARMACY_OVER_LIMIT_MULTIPLIER = 0.35;
/** Guessing at undiagnosed symptoms over the pharmacy counter. */
export const PHARMACY_UNDIAGNOSED_MULTIPLIER = 0.6;

export interface TreatmentCheck {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Can this facility treat this condition at this severity at all? */
export function canTreatAt(conditionId: ConditionId, severity: ConditionSeverity, facility: CareFacilityType): TreatmentCheck {
  const condition = CONDITIONS[conditionId];
  if (conditionId === 'pregnancy') {
    return FACILITIES[facility].antenatalPrice === null
      ? { ok: false, reason: 'Antenatal care happens at a hospital' }
      : { ok: true };
  }
  if (facility === 'pharmacy') {
    if (condition.pharmacyLimit === null) return { ok: false, reason: `A pharmacy can’t treat ${condition.label.toLowerCase()} — see a doctor` };
    if (FACILITIES.pharmacy.price[severity] === null) return { ok: false, reason: 'This is an emergency — go to a hospital now' };
  }
  return FACILITIES[facility].price[severity] === null ? { ok: false, reason: 'They can’t handle this here' } : { ok: true };
}

/** Base treatment price (₦, before the world price index), or null if the facility can't treat it. */
export function treatmentBasePrice(conditionId: ConditionId, severity: ConditionSeverity, facility: CareFacilityType): number | null {
  if (!canTreatAt(conditionId, severity, facility).ok) return null;
  if (conditionId === 'pregnancy') return FACILITIES[facility].antenatalPrice;
  const base = FACILITIES[facility].price[severity];
  return base === null ? null : Math.round(base * CONDITIONS[conditionId].costFactor);
}

export interface TreatmentOddsOptions {
  readonly diagnosed: boolean;
  /** Resident doctors are on strike (public hospitals only). */
  readonly strike?: boolean;
  readonly method?: TreatmentMethod;
}

/** Tablets (the default) or an injection ("doctor, abeg give me injection, it works faster"). */
export const TREATMENT_METHODS = ['tablets', 'injection'] as const;
export type TreatmentMethod = (typeof TREATMENT_METHODS)[number];

/**
 * An injection costs more (drugs, syringe, a nurse) and works more often; it stings a little. Only hospitals give
 * them — pharmacists send you to one.
 */
export const INJECTION_RULES = { priceMultiplier: 1.6, successBonus: 0.1, maxSuccess: 0.97, moodPenalty: -2 } as const;

export function injectionAvailableAt(facility: CareFacilityType): boolean {
  return facility !== 'pharmacy';
}

/** Chance a treatment works (0-1). Private ≥ public ≥ pharmacy at every severity. */
export function treatmentSuccessChance(
  conditionId: ConditionId,
  severity: ConditionSeverity,
  facility: CareFacilityType,
  options: TreatmentOddsOptions,
): number {
  if (!canTreatAt(conditionId, severity, facility).ok) return 0;
  if (conditionId === 'pregnancy') return 1;
  const condition = CONDITIONS[conditionId];
  let chance = FACILITIES[facility].success[severity];
  if (facility === 'pharmacy') {
    const limit = condition.pharmacyLimit;
    if (limit !== null && severityRank(severity) > severityRank(limit)) chance *= PHARMACY_OVER_LIMIT_MULTIPLIER;
    if (!options.diagnosed) chance *= PHARMACY_UNDIAGNOSED_MULTIPLIER;
  }
  if (facility === 'hospital-public' && options.strike) chance *= STRIKE_SUCCESS_MULTIPLIER;
  if (options.method === 'injection' && injectionAvailableAt(facility)) chance = Math.min(INJECTION_RULES.maxSuccess, Math.max(chance, chance + INJECTION_RULES.successBonus));
  return Math.round(Math.min(1, Math.max(0, chance)) * 1000) / 1000;
}

/** Game minutes a visit takes (queue + treatment). */
export function treatmentMinutes(conditionId: ConditionId, severity: ConditionSeverity, facility: CareFacilityType, strike = false): number {
  const definition = FACILITIES[facility];
  const base = conditionId === 'pregnancy' ? definition.antenatalMinutes : definition.visitMinutes[severity];
  return facility === 'hospital-public' && strike ? base * STRIKE_WAIT_MULTIPLIER : base;
}

export function checkUpMinutes(facility: CareFacilityType, strike = false): number {
  const base = FACILITIES[facility].checkUpMinutes;
  return facility === 'hospital-public' && strike ? base * STRIKE_WAIT_MULTIPLIER : base;
}

/** Can this facility diagnose the condition during a check-up? */
export function canDiagnoseAt(conditionId: ConditionId, facility: CareFacilityType): boolean {
  return facility !== 'pharmacy' || CONDITIONS[conditionId].pharmacyDiagnosable;
}

/** Admission days after a successful hospital treatment (pharmacies never admit). */
export function admissionDaysFor(conditionId: ConditionId, severity: ConditionSeverity, facility: CareFacilityType): number {
  return FACILITIES[facility].admissionPerDay === null ? 0 : CONDITIONS[conditionId].admissionDays[severity];
}

// ---------------------------------------------------------------------------------------------------------------
// HMO plans
// ---------------------------------------------------------------------------------------------------------------

export const HMO_PLAN_IDS = ['basic', 'standard', 'comprehensive', 'executive'] as const;
export type HmoPlanId = (typeof HMO_PLAN_IDS)[number];

export function isHmoPlanId(value: string): value is HmoPlanId {
  return (HMO_PLAN_IDS as readonly string[]).includes(value);
}

export interface HmoPlanDefinition {
  readonly id: HmoPlanId;
  readonly label: string;
  readonly blurb: string;
  /** Annual premium (₦, before the price index); billed monthly. */
  readonly annualPremium: number;
  /** Share of a bill the HMO pays, by facility tier. */
  readonly coverage: Readonly<Record<CareFacilityType, number>>;
  /** Most the HMO pays in a calendar year (₦). */
  readonly annualLimit: number;
  /** Share of a delivery bill covered (0 = maternity excluded). */
  readonly maternity: number;
}

export const HMO_PLANS: Readonly<Record<HmoPlanId, HmoPlanDefinition>> = {
  basic: {
    id: 'basic',
    label: 'Basic',
    blurb: 'Public hospitals mostly covered. Good starter plan for corpers and new workers.',
    annualPremium: 45_000,
    coverage: { pharmacy: 0, 'hospital-public': 0.7, 'hospital-private': 0.25 },
    annualLimit: 600_000,
    maternity: 0,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    blurb: 'Solid cover at public hospitals, decent at private clinics. Maternity half covered.',
    annualPremium: 140_000,
    coverage: { pharmacy: 0.3, 'hospital-public': 0.9, 'hospital-private': 0.6 },
    annualLimit: 2_000_000,
    maternity: 0.5,
  },
  comprehensive: {
    id: 'comprehensive',
    label: 'Comprehensive',
    blurb: 'Most private hospitals, drugs and maternity. Peace of mind for families.',
    annualPremium: 400_000,
    coverage: { pharmacy: 0.5, 'hospital-public': 1, 'hospital-private': 0.85 },
    annualLimit: 6_000_000,
    maternity: 0.8,
  },
  executive: {
    id: 'executive',
    label: 'Executive',
    blurb: 'Premium hospitals, private rooms, everything covered. Odogwu healthcare.',
    annualPremium: 900_000,
    coverage: { pharmacy: 0.8, 'hospital-public': 1, 'hospital-private': 0.95 },
    annualLimit: 20_000_000,
    maternity: 1,
  },
};

/** Base monthly premium (₦, before the price index). */
export function hmoMonthlyPremium(planId: HmoPlanId): number {
  return Math.round(HMO_PLANS[planId].annualPremium / 12);
}

/** New members wait this many game days before claims are honoured (no buying cover at the hospital door). */
export const HMO_WAITING_DAYS = 14;

// ---------------------------------------------------------------------------------------------------------------
// Pregnancy
// ---------------------------------------------------------------------------------------------------------------

/** Nine game months (≈ 2¼ real days). */
export const PREGNANCY_MINUTES = 9 * MINUTES_PER_MONTH;
/** Months after conception when an antenatal visit is due. */
export const ANTENATAL_SCHEDULE_MONTHS = [2, 4, 6, 8] as const;
export const RECOMMENDED_ANTENATAL_VISITS = ANTENATAL_SCHEDULE_MONTHS.length;
/** Pregnancies aren't started for carriers older than this. */
export const MAX_CARRIER_AGE = 50;

export type Trimester = 1 | 2 | 3;

export const PREGNANCY_TRIMESTERS: Readonly<Record<Trimester, ConditionSymptoms & { readonly label: string }>> = {
  1: { label: 'First trimester', ...symptom('Morning sickness and tiredness', 75, -4, 0, { hunger: -8 }) },
  2: { label: 'Second trimester', ...symptom('The pregnancy glow — your energy is back', 90, 3, 0) },
  3: { label: 'Third trimester', ...symptom('Heavy, backache and swollen feet', 65, -2, 0) },
};

export function pregnancyTrimester(conceivedAt: GameMinute, t: GameMinute): Trimester {
  const months = (t - conceivedAt) / MINUTES_PER_MONTH;
  return months < 3 ? 1 : months < 6 ? 2 : 3;
}

/** When the next antenatal visit is due (null once the schedule is complete). */
export function nextAntenatalDue(conceivedAt: GameMinute, visitsDone: number): GameMinute | null {
  const month = ANTENATAL_SCHEDULE_MONTHS[visitsDone];
  return month === undefined ? null : conceivedAt + month * MINUTES_PER_MONTH;
}

export interface ComplicationInput {
  readonly antenatalVisits: number;
  readonly carrierAge: number;
  readonly carrierHealth: number;
}

/** Chance of a delivery complication (always non-fatal in the game; it means an emergency C-section). */
export function deliveryComplicationChance(input: ComplicationInput): number {
  let chance = 0.06 - 0.012 * Math.min(input.antenatalVisits, RECOMMENDED_ANTENATAL_VISITS);
  chance = Math.max(0.015, chance);
  if (input.carrierHealth < 40) chance += 0.04;
  if (input.carrierAge >= 38) chance += 0.03;
  return Math.round(chance * 1000) / 1000;
}

// ---------------------------------------------------------------------------------------------------------------
// Getting sick: daily and per-meal odds
// ---------------------------------------------------------------------------------------------------------------

/** Mosquitoes love the rains. */
export const SEASON_MALARIA_FACTOR: Readonly<Record<Season, number>> = {
  harmattan: 0.3,
  dry: 0.6,
  rainy: 2.5,
  'august-break': 1.4,
  'detty-december': 0.5,
};

export const SEASON_CATARRH_FACTOR: Readonly<Record<Season, number>> = {
  harmattan: 2.5,
  dry: 0.8,
  rainy: 1.5,
  'august-break': 1.2,
  'detty-december': 1.3,
};

export const MALARIA_DAILY_BASE = 0.0018;
export const CATARRH_DAILY_BASE = 0.004;
/** Insecticide-treated nets roughly halve bites. */
export const MOSQUITO_NET_FACTOR = 0.45;
export const FUMIGATION_FACTOR = 0.6;

export interface MalariaRiskInput {
  readonly season: Season;
  /** Home comfort equilibrium (0-100): stagnant gutters and no screens vs sealed, sprayed homes. */
  readonly comfort: number;
  readonly hasNet: boolean;
  readonly fumigated: boolean;
}

export function malariaDailyChance(input: MalariaRiskInput): number {
  const comfortFactor = Math.min(2, Math.max(0.25, 1 + (60 - input.comfort) / 40));
  let chance = MALARIA_DAILY_BASE * SEASON_MALARIA_FACTOR[input.season] * comfortFactor;
  if (input.hasNet) chance *= MOSQUITO_NET_FACTOR;
  if (input.fumigated) chance *= FUMIGATION_FACTOR;
  return chance;
}

export function catarrhDailyChance(season: Season): number {
  return CATARRH_DAILY_BASE * SEASON_CATARRH_FACTOR[season];
}

export type FoodRiskHook = 'food-risk-low' | 'food-risk-high';

/** Per-meal chance of catching something. */
export const FOOD_RISK: Readonly<Record<FoodRiskHook, Readonly<{ typhoid: number; 'food-poisoning': number }>>> = {
  'food-risk-low': { typhoid: 0.002, 'food-poisoning': 0.008 },
  'food-risk-high': { typhoid: 0.012, 'food-poisoning': 0.035 },
};

export interface ChronicRiskInput {
  readonly age: number;
  readonly lifestyle: LifestyleTier;
  readonly fitness: number;
  /** 0-1 recent stress (job stress and low mood). */
  readonly stress: number;
  readonly hasHypertension?: boolean;
}

/** Yearly (birthday) chance of developing high blood pressure. Zero before 35. */
export function hypertensionYearlyChance(input: ChronicRiskInput): number {
  if (input.age < 35) return 0;
  let chance = 0.012 + 0.0015 * (input.age - 35);
  if (input.lifestyle === 'sapa') chance += 0.01;
  if (input.lifestyle === 'odogwu') chance += 0.006;
  chance += 0.025 * Math.min(1, Math.max(0, input.stress));
  if (input.fitness < 30) chance += 0.012;
  if (input.fitness > 70) chance -= 0.01;
  return Math.max(0.002, Math.round(chance * 10000) / 10000);
}

/** Yearly (birthday) chance of developing type 2 diabetes. Zero before 40. */
export function diabetesYearlyChance(input: ChronicRiskInput): number {
  if (input.age < 40) return 0;
  let chance = 0.004 + 0.0004 * (input.age - 40);
  if (input.lifestyle === 'soft-life' || input.lifestyle === 'odogwu') chance += 0.003;
  if (input.fitness < 30) chance += 0.006;
  if (input.fitness > 70) chance -= 0.003;
  if (input.hasHypertension) chance += 0.004;
  return Math.max(0.001, Math.round(chance * 10000) / 10000);
}

/** Consecutive stressful days before burnout becomes possible. */
export const BURNOUT_STREAK_THRESHOLD = 5;

export function burnoutDailyChance(stressStreak: number): number {
  if (stressStreak < BURNOUT_STREAK_THRESHOLD) return 0;
  return Math.min(0.25, 0.04 + 0.02 * (stressStreak - BURNOUT_STREAK_THRESHOLD));
}

export interface RoadInjuryProfile {
  /** Share of this mode's incidents (TRANSPORT[mode].incidentRisk) that injure the rider. */
  readonly injuryShare: number;
  readonly severity: SeverityTable<number>;
  readonly story: string;
}

/** Road injuries from public transport and trekking (own-car crashes belong to the vehicles domain). */
export const ROAD_INJURY: Readonly<Partial<Record<TransportMode, RoadInjuryProfile>>> = {
  okada: { injuryShare: 0.6, severity: table(45, 33, 18, 4), story: 'The okada rider skidded in traffic and you went flying.' },
  keke: { injuryShare: 0.5, severity: table(55, 30, 13, 2), story: 'Your keke tipped over at a bad corner.' },
  danfo: { injuryShare: 0.1, severity: table(65, 25, 9, 1), story: 'The danfo braked hard and your head met the seat in front.' },
  brt: { injuryShare: 0.1, severity: table(70, 24, 6, 0), story: 'You got squeezed in the BRT rush-hour scramble.' },
  bolt: { injuryShare: 0.15, severity: table(65, 25, 9, 1), story: 'Your Bolt got rear-ended at a junction.' },
  walk: { injuryShare: 0.1, severity: table(75, 20, 5, 0), story: 'You missed your step on an open gutter.' },
};

/** Per-session chance of a gym injury (higher when exhausted). */
export function exerciseInjuryChance(energy: number): number {
  return energy < 20 ? 0.015 : 0.004;
}

// ---------------------------------------------------------------------------------------------------------------
// Daily health drift
// ---------------------------------------------------------------------------------------------------------------

export interface HealthDriftInput {
  readonly health: number;
  readonly age: number;
  /** LIFESTYLES[tier].healthDrift */
  readonly lifestyleDrift: number;
  readonly mood: number;
  readonly fitness: number;
  /** Sum of today's condition damage (healthPerDay of every untreated condition). */
  readonly conditionDamage: number;
  /** Consecutive days ending with at least one need below 15. */
  readonly lowNeedStreak: number;
  /** How many needs are below 15 right now. */
  readonly lowNeeds: number;
  /** Couldn't afford food today. */
  readonly broke: boolean;
  /** Health regained from hospital care while admitted (FACILITIES[x].careQuality), 0 otherwise. */
  readonly hospitalCare: number;
}

export interface HealthDriftBreakdown {
  readonly lifestyle: number;
  readonly mood: number;
  readonly fitness: number;
  readonly age: number;
  readonly conditions: number;
  readonly deprivation: number;
  readonly recovery: number;
  readonly care: number;
  readonly total: number;
}

/** The body's natural set point; it heals toward it (and sags toward it from above) every day. */
export function healthSetPoint(age: number): number {
  return 85 - 0.4 * Math.max(0, age - 45);
}

const HEALTH_REVERSION_RATE = 0.03;

/** Health lost to ageing per day (zero until 45, then accelerating). */
export function ageHealthEffect(age: number): number {
  const over = Math.max(0, age - 45);
  return 0.0008 * over * over;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Daily change in health: lifestyle (diet) + mood + fitness − ageing − illness − deprivation, plus the body's own
 * reversion toward its age-dependent set point and hospital care when admitted.
 */
export function healthDailyDrift(input: HealthDriftInput): HealthDriftBreakdown {
  const lifestyle = input.lifestyleDrift;
  const mood = (input.mood - 50) * 0.01;
  const fitness = (input.fitness - 40) * 0.008;
  const age = -ageHealthEffect(input.age);
  const conditions = -input.conditionDamage;
  const deprivationPerDay = input.lowNeedStreak >= 2 ? 0.4 * Math.min(input.lowNeedStreak, 5) * (input.lowNeeds >= 2 ? 1.5 : 1) : 0;
  const deprivation = -(deprivationPerDay + (input.broke ? 0.3 : 0));
  const recovery = (healthSetPoint(input.age) - input.health) * HEALTH_REVERSION_RATE;
  const care = input.hospitalCare;
  const total = lifestyle + mood + fitness + age + conditions + deprivation + recovery + care;
  return {
    lifestyle: round2(lifestyle),
    mood: round2(mood),
    fitness: round2(fitness),
    age: round2(age),
    conditions: round2(conditions),
    deprivation: round2(deprivation),
    recovery: round2(recovery),
    care: round2(care),
    total: round2(total),
  };
}

export const HEALTH_BANDS = [
  { min: 85, label: 'Strong like iroko' },
  { min: 70, label: 'Healthy' },
  { min: 50, label: 'Fair' },
  { min: 30, label: 'Poorly' },
  { min: 15, label: 'Very ill' },
  { min: 0, label: 'Gravely ill' },
] as const;

export function healthBand(health: number): (typeof HEALTH_BANDS)[number] {
  return HEALTH_BANDS.find((band) => health >= band.min) ?? HEALTH_BANDS[HEALTH_BANDS.length - 1]!;
}

// ---------------------------------------------------------------------------------------------------------------
// Mortality
// ---------------------------------------------------------------------------------------------------------------

/** No natural (age-related) deaths before this age; only untreated critical illness can end a younger life. */
export const NATURAL_DEATH_MIN_AGE = 40;
/** Days a fatal condition must sit untreated at critical (with daily warnings) before it can take a life. */
export const CRITICAL_GRACE_DAYS = 3;

const GOMPERTZ_A = 0.004;
const GOMPERTZ_B = 0.1;
const HEALTH_HAZARD_SLOPE = 0.04;

export interface MortalityInput {
  readonly age: number;
  readonly health: number;
  /** Chronic conditions that are not under control (unmanaged hypertension, diabetes). */
  readonly unmanagedChronic: number;
  /** Ongoing access to good care (comprehensive or executive HMO). */
  readonly goodCare: boolean;
}

/**
 * Annual hazard of a natural death (Gompertz curve). An average Lagos life (health ~70 at 60) has a median lifespan
 * in the mid-to-high 60s; strong health and good care push it toward 80+, poor health pulls it into the early 60s.
 */
export function annualMortalityHazard(input: MortalityInput): number {
  if (input.age < NATURAL_DEATH_MIN_AGE) return 0;
  let hazard = GOMPERTZ_A * Math.exp(GOMPERTZ_B * (input.age - NATURAL_DEATH_MIN_AGE));
  hazard *= Math.exp(-HEALTH_HAZARD_SLOPE * (input.health - 70));
  hazard *= 1 + 0.5 * Math.max(0, input.unmanagedChronic);
  if (input.goodCare) hazard *= 0.9;
  return Math.min(3, hazard);
}

/** Chance of a natural death on one game day. */
export function dailyMortalityChance(input: MortalityInput): number {
  return 1 - Math.exp(-annualMortalityHazard(input) / DAYS_PER_YEAR);
}

/** Probability of surviving from `fromAge` to `toAge` at a constant health level (for UI outlook and tests). */
export function survivalProbability(fromAge: number, toAge: number, health: number, options: { unmanagedChronic?: number; goodCare?: boolean } = {}): number {
  let logSurvival = 0;
  for (let age = fromAge; age < toAge; age++) {
    logSurvival -= annualMortalityHazard({ age, health, unmanagedChronic: options.unmanagedChronic ?? 0, goodCare: options.goodCare ?? false });
  }
  return Math.exp(logSurvival);
}

// ---------------------------------------------------------------------------------------------------------------
// Resident doctors' strikes (world calendar)
// ---------------------------------------------------------------------------------------------------------------

export interface DoctorsStrike {
  readonly id: string;
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
}

const strikeCache = new Map<string, readonly DoctorsStrike[]>();

/**
 * NARD (resident doctors) strikes are a recurring fact of Nigerian public healthcare. Like every world event they are
 * a pure function of the world seed, so every server and client agrees on when public hospitals slow down.
 */
export function residentDoctorsStrikes(seed: string, year: number): readonly DoctorsStrike[] {
  const key = `${seed}:${year}`;
  const cached = strikeCache.get(key);
  if (cached) return cached;
  const rng = rngFor(seed, 'nard-strike', year);
  const strikes: DoctorsStrike[] = [];
  if (rng.chance(0.45)) {
    const startsAt = fromDateParts({ year, month: rng.int(1, 12), day: rng.int(1, 30) });
    strikes.push({ id: `${year}-nard`, startsAt, endsAt: startsAt + rng.int(14, 60) * MINUTES_PER_DAY });
  }
  if (strikeCache.size > 64) strikeCache.clear();
  strikeCache.set(key, strikes);
  return strikes;
}

export function doctorsStrikeAt(seed: string, t: GameMinute): DoctorsStrike | null {
  const { year } = toDateParts(t);
  for (const candidate of [...residentDoctorsStrikes(seed, year - 1), ...residentDoctorsStrikes(seed, year)]) {
    if (candidate.startsAt <= t && t < candidate.endsAt) return candidate;
  }
  return null;
}

/** Shop item that protects against mosquitoes (owned by the shop catalog). */
export const MOSQUITO_NET_TAG = 'mosquito-net';
export const MOSQUITO_NET_ITEM_ID = 'mosquito-net';
