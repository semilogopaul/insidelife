import {
  CARE_FACILITY_TYPES,
  PREGNANCY_MINUTES,
  type CareFacilityType,
  type ConditionSeverity,
  type GameMinute,
  type HealthConditionDto,
  type HealthDriftBreakdown,
  type TreatmentQuoteDto,
} from '@insidelife/shared';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export function healthTone(health: number): Tone {
  if (health >= 70) return 'good';
  if (health >= 40) return 'warn';
  return 'bad';
}

export const SEVERITY_TONE: Record<ConditionSeverity, Tone> = {
  mild: 'neutral',
  moderate: 'warn',
  severe: 'bad',
  critical: 'bad',
};

const FACILITY_ORDER = new Map(CARE_FACILITY_TYPES.map((type, index) => [type, index]));

/** Available options first, then pharmacy → public → private (cheapest kind of place first). */
export function sortQuotes<T extends Pick<TreatmentQuoteDto, 'available' | 'facility'>>(
  quotes: readonly T[],
): T[] {
  return [...quotes].sort(
    (a, b) =>
      Number(b.available) - Number(a.available) ||
      (FACILITY_ORDER.get(a.facility) ?? 0) - (FACILITY_ORDER.get(b.facility) ?? 0),
  );
}

/**
 * The sensible choice. Mild: the cheapest place that works at least 60% of the time. Moderate: the cheapest place
 * within 10 points of the best odds. Severe/critical: the best odds (cheapest among equals). Null when nobody can
 * treat it.
 */
export function recommendedQuote<
  T extends Pick<TreatmentQuoteDto, 'available' | 'facility' | 'successChance' | 'youPay'>,
>(quotes: readonly T[], severity: ConditionSeverity): T | null {
  const available = quotes.filter((quote) => quote.available);
  if (available.length === 0) return null;
  const best =
    [...available].sort((a, b) => b.successChance - a.successChance || a.youPay - b.youPay)[0] ?? null;
  if (!best || severity === 'severe' || severity === 'critical') return best;
  const floor = severity === 'mild' ? 0.6 : best.successChance - 0.1;
  const good = available
    .filter((quote) => quote.successChance >= floor - 1e-9)
    .sort((a, b) => a.youPay - b.youPay);
  return good[0] ?? best;
}

/** "70%" coverage. */
export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Conditions to show as illnesses (pregnancy has its own tracker; recovered ones go to history). */
export function activeIllnesses(conditions: readonly HealthConditionDto[]): HealthConditionDto[] {
  const rank: Record<ConditionSeverity, number> = { critical: 0, severe: 1, moderate: 2, mild: 3 };
  return conditions
    .filter((condition) => condition.kind !== 'pregnancy' && condition.status !== 'recovered')
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export interface PregnancyProgress {
  /** 0-1 through the nine months. */
  readonly ratio: number;
  /** 1-40, like a real antenatal card. */
  readonly week: number;
}

export function pregnancyProgress(conceivedAt: GameMinute, now: GameMinute): PregnancyProgress {
  const ratio = Math.max(0, Math.min(1, (now - conceivedAt) / PREGNANCY_MINUTES));
  return { ratio, week: Math.min(40, Math.max(1, Math.floor(ratio * 40) + 1)) };
}

const DRIFT_LABELS: Record<Exclude<keyof HealthDriftBreakdown, 'total'>, string> = {
  lifestyle: 'How you live (food, comfort)',
  mood: 'Mood',
  fitness: 'Fitness',
  age: 'Age',
  conditions: 'Illness',
  deprivation: 'Hunger & exhaustion',
  recovery: 'Natural recovery',
  care: 'Medical care',
};

/** Yesterday's health change, biggest effects first (zeros dropped). */
export function driftLines(
  drift: HealthDriftBreakdown,
): ReadonlyArray<{ readonly label: string; readonly value: number }> {
  return (Object.keys(DRIFT_LABELS) as Array<keyof typeof DRIFT_LABELS>)
    .map((key) => ({ label: DRIFT_LABELS[key], value: drift[key] }))
    .filter((line) => Math.abs(line.value) >= 0.05)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

export const FACILITY_SHORT: Record<CareFacilityType, string> = {
  pharmacy: 'Pharmacy',
  'hospital-public': 'Public hospital',
  'hospital-private': 'Private hospital',
};
