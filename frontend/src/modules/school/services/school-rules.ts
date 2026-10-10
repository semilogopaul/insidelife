import {
  JAMB_MIN_POLYTECHNIC,
  JAMB_MIN_UNIVERSITY,
  districtDistance,
  type AcceptanceQuoteDto,
  type AdmissionApplicationDto,
  type DistrictId,
  type EducationEnrolmentDto,
  type EducationOverviewDto,
  type ExamKind,
  type ExamRegistrationDto,
  type GameMinute,
  type NyscServiceDto,
  type StrikeBannerDto,
  type VenueDefinition,
  type WaecGrade,
} from '@insidelife/shared';
import type { ReceiptLine } from '@/common/components';

// ----- Pipeline ----------------------------------------------------------------------------------------------------

export const STAGES = ['waec', 'jamb', 'admission', 'campus', 'nysc'] as const;
export type StageId = (typeof STAGES)[number];
export type StageStatus = 'done' | 'current' | 'todo';

const OPEN_ENROLMENT = new Set(['admitted', 'active', 'suspended']);

/** The most recent registration of a kind (JAMB rewrites, GCE resits). */
export function latestExam(
  exams: readonly ExamRegistrationDto[],
  kind: ExamKind,
): ExamRegistrationDto | null {
  return (
    exams.filter((exam) => exam.kind === kind).sort((a, b) => b.registeredAt - a.registeredAt)[0] ?? null
  );
}

function enrolled(overview: Pick<EducationOverviewDto, 'enrolment'>): EducationEnrolmentDto | null {
  return overview.enrolment && OPEN_ENROLMENT.has(overview.enrolment.status) ? overview.enrolment : null;
}

/** A UTME score good enough for at least a polytechnic. */
export function usableJambScore(score: number | null): score is number {
  return score !== null && score >= JAMB_MIN_POLYTECHNIC;
}

/** Where the player is on WAEC → JAMB → Admission → Campus → NYSC. */
export function stageStatuses(
  overview: Pick<EducationOverviewDto, 'waec' | 'jamb' | 'enrolment' | 'degrees' | 'nysc' | 'exams'>,
): Record<StageId, StageStatus> {
  const inSchool = enrolled(overview) !== null;
  const graduated = overview.degrees.length > 0;
  const past = inSchool || graduated;
  const waecDone = overview.waec.meetsUniversityMinimum || past;
  const jambDone = usableJambScore(overview.jamb.score) || past;
  const nyscDone = overview.nysc.status === 'completed' || overview.nysc.status === 'exempt';
  // JAMB can run alongside a WAEC resit: a pending registration makes it current too.
  const jambUnderway = overview.exams.some((exam) => exam.kind === 'jamb' && exam.status !== 'released');
  return {
    waec: waecDone ? 'done' : 'current',
    jamb: jambDone ? 'done' : waecDone || jambUnderway ? 'current' : 'todo',
    admission: past ? 'done' : jambDone ? 'current' : 'todo',
    campus: inSchool ? 'current' : graduated ? 'done' : 'todo',
    nysc: nyscDone ? 'done' : graduated && !inSchool ? 'current' : 'todo',
  };
}

// ----- The one next step --------------------------------------------------------------------------------------------

export type SchoolNextStep =
  | { readonly kind: 'pay-fees'; readonly enrolment: EducationEnrolmentDto }
  | { readonly kind: 'strike'; readonly strike: StrikeBannerDto }
  | { readonly kind: 'attend'; readonly enrolment: EducationEnrolmentDto }
  | { readonly kind: 'register-nysc' }
  | { readonly kind: 'serving'; readonly nysc: NyscServiceDto }
  | { readonly kind: 'level-up' }
  | { readonly kind: 'accept-offer'; readonly application: AdmissionApplicationDto }
  | { readonly kind: 'resit-waec' }
  | { readonly kind: 'await-gce'; readonly exam: ExamRegistrationDto }
  | { readonly kind: 'prepare-jamb'; readonly exam: ExamRegistrationDto }
  | { readonly kind: 'sit-jamb'; readonly exam: ExamRegistrationDto }
  | { readonly kind: 'writing-jamb'; readonly exam: ExamRegistrationDto }
  | { readonly kind: 'await-jamb'; readonly exam: ExamRegistrationDto }
  | { readonly kind: 'await-admission'; readonly application: AdmissionApplicationDto }
  | { readonly kind: 'apply-admission'; readonly score: number }
  | { readonly kind: 'register-jamb'; readonly lastScore: number | null };

const PENDING_EXAM = new Set(['registered', 'sitting', 'written']);

/** The single most useful thing to do next in school, in priority order. */
export function schoolNextStep(overview: EducationOverviewDto, now: GameMinute): SchoolNextStep {
  const enrolment = enrolled(overview);
  if (enrolment) {
    if (enrolment.fees.due > 0) return { kind: 'pay-fees', enrolment };
    if (overview.strike?.affectsYou) return { kind: 'strike', strike: overview.strike };
    return { kind: 'attend', enrolment };
  }
  if (overview.nysc.status === 'pending') return { kind: 'register-nysc' };
  if (overview.nysc.status === 'serving') return { kind: 'serving', nysc: overview.nysc };
  if (overview.degrees.length > 0) return { kind: 'level-up' };

  const offer = overview.applications.find((application) => application.status === 'offered');
  if (offer) return { kind: 'accept-offer', application: offer };

  const gce = latestExam(overview.exams, 'waec-gce');
  if (gce && PENDING_EXAM.has(gce.status) && !overview.waec.meetsUniversityMinimum)
    return { kind: 'await-gce', exam: gce };
  if (!overview.waec.meetsUniversityMinimum) return { kind: 'resit-waec' };

  const jamb = latestExam(overview.exams, 'jamb');
  if (jamb && jamb.status === 'registered')
    return now < jamb.canSitFrom ? { kind: 'prepare-jamb', exam: jamb } : { kind: 'sit-jamb', exam: jamb };
  if (jamb && jamb.status === 'sitting') return { kind: 'writing-jamb', exam: jamb };
  if (jamb && jamb.status === 'written') return { kind: 'await-jamb', exam: jamb };

  if (usableJambScore(overview.jamb.score)) {
    const screening = overview.applications.find((application) => application.status === 'screening');
    if (screening) return { kind: 'await-admission', application: screening };
    return { kind: 'apply-admission', score: overview.jamb.score };
  }
  return { kind: 'register-jamb', lastScore: overview.jamb.score };
}

// ----- JAMB -------------------------------------------------------------------------------------------------------

/** Prep hours (effective: game hours of study × ACTION_PACE) that get you about two-thirds of the benefit (returns diminish after). */
export const JAMB_PREP_SCALE_HOURS = 22;

/** 0-1 preparation: 1 − e^(−hours / 22). */
export function jambReadiness(prepHours: number): number {
  if (prepHours <= 0) return 0;
  return 1 - Math.exp(-prepHours / JAMB_PREP_SCALE_HOURS);
}

export type ScoreVerdict = 'university' | 'polytechnic' | 'retake';

export function jambVerdict(score: number): ScoreVerdict {
  if (score >= JAMB_MIN_UNIVERSITY) return 'university';
  if (score >= JAMB_MIN_POLYTECHNIC) return 'polytechnic';
  return 'retake';
}

// ----- WAEC --------------------------------------------------------------------------------------------------------

export type GradeBand = 'distinction' | 'credit' | 'pass' | 'fail';

/** A1–B3 distinction, C4–C6 credit, D7–E8 pass, F9 fail. */
export function gradeBand(grade: WaecGrade): GradeBand {
  if (grade === 'A1' || grade === 'B2' || grade === 'B3') return 'distinction';
  if (grade === 'C4' || grade === 'C5' || grade === 'C6') return 'credit';
  if (grade === 'F9') return 'fail';
  return 'pass';
}

// ----- Money -------------------------------------------------------------------------------------------------------

/** Acceptance fee + first session, with the parents' sponsorship shown as a deduction. */
export function acceptanceLines(quote: AcceptanceQuoteDto): {
  readonly lines: ReceiptLine[];
  readonly total: number;
} {
  const lines: ReceiptLine[] = [
    { label: 'Acceptance fee', amount: quote.acceptanceFee },
    {
      label: 'First session fees',
      amount: quote.firstSessionFees,
      note: 'Tuition (and hostel, out of town)',
    },
  ];
  if (quote.sponsoredByParents)
    lines.push({
      label: 'Your parents pay this session',
      amount: -quote.firstSessionFees,
      note: 'Family perk — make them proud',
    });
  return { lines, total: quote.total };
}

// ----- Places ------------------------------------------------------------------------------------------------------

/** The closest venue to a district (ties keep catalogue order). */
export function nearestVenue<T extends Pick<VenueDefinition, 'districtId'>>(
  venues: readonly T[],
  from: DistrictId | null,
): T | null {
  if (venues.length === 0) return null;
  if (!from) return venues[0] ?? null;
  return (
    [...venues].sort(
      (a, b) => districtDistance(from, a.districtId) - districtDistance(from, b.districtId),
    )[0] ?? null
  );
}
