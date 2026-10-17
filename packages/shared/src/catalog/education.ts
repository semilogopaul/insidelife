import type { SkillKey } from './life.js';
import type { VenueId } from './venues.js';

/**
 * Education catalog — the Nigerian pipeline: WAEC → JAMB → admission → university/polytechnic → NYSC → professional
 * programmes. Fees are 2025/26 annual figures (see docs/research/nigeria-economy-2026.md); charge them through the
 * world price index on the server.
 */

// ---------------------------------------------------------------------------------------------------------------
// Fees, timings and thresholds
// ---------------------------------------------------------------------------------------------------------------

export const JAMB_UTME_FEE = 7_200;
export const WAEC_GCE_FEE = 30_000;
/** Paid when you apply to an institution that wasn't your JAMB first choice. */
export const CHANGE_OF_INSTITUTION_FEE = 2_500;

export const JAMB_MAX_SCORE = 400;
/** 2026 national minimum UTME scores. */
export const JAMB_MIN_UNIVERSITY = 150;
export const JAMB_MIN_POLYTECHNIC = 100;
/** Game days between registering and sitting (prep time). */
export const EXAM_PREP_DAYS = 3;
/** Length of the `write-exam` action in game minutes. */
export const EXAM_DURATION_MINUTES = 90;
/** Latest hour a sitting can start so it ends before the CBT centre closes. */
export const EXAM_LATEST_START_HOUR = 15;
/** WAEC GCE results arrive this many game days after the paper. */
export const GCE_RESULT_DAYS = 7;

/** Post-UTME screening decisions arrive this many game days after applying. */
export const ADMISSION_DECISION_DAYS = 5;
/** Days to accept an offer before it lapses. */
export const ACCEPTANCE_WINDOW_DAYS = 14;
export const MAX_PENDING_APPLICATIONS = 3;
/** Aggregate points below the cut-off that can still make the supplementary list. */
export const SUPPLEMENTARY_LIST_MARGIN = 2;

export const SEMESTERS_PER_SESSION = 2;
export const SEMESTER_MONTHS = 6;
/** Days after fees fall due before a student is suspended. */
export const FEES_GRACE_DAYS = 30;
/** Carry-over semesters allowed before a student is withdrawn for poor performance. */
export const MAX_EXTRA_SEMESTERS = 2;

/** Weekday lecture hours (09:00-15:00). */
export const LECTURE_START_HOUR = 9;
export const LECTURE_END_HOUR = 15;

export const NYSC_MONTHLY_ALLOWANCE = 77_000;
export const NYSC_SERVICE_DAYS = 360;
/** Graduates this old (or older) at graduation are exempted from NYSC. */
export const NYSC_EXEMPTION_AGE = 30;
/** Place of Primary Assignment hours (Mon-Fri 08:00-16:00; Thursdays are CDS). */
export const NYSC_PPA_START_HOUR = 8;
export const NYSC_PPA_END_HOUR = 16;

// ---------------------------------------------------------------------------------------------------------------
// WAEC
// ---------------------------------------------------------------------------------------------------------------

export const WAEC_SUBJECTS = [
  { id: 'english', label: 'English Language' },
  { id: 'mathematics', label: 'Mathematics' },
  { id: 'civic-education', label: 'Civic Education' },
  { id: 'biology', label: 'Biology' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'physics', label: 'Physics' },
  { id: 'economics', label: 'Economics' },
  { id: 'literature', label: 'Literature-in-English' },
  { id: 'government', label: 'Government' },
] as const;
export type WaecSubjectId = (typeof WAEC_SUBJECTS)[number]['id'];

export const WAEC_GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'] as const;
export type WaecGrade = (typeof WAEC_GRADES)[number];

/** Minimum raw score (0-100) for each grade, best first. */
const WAEC_GRADE_FLOORS: ReadonlyArray<readonly [WaecGrade, number]> = [
  ['A1', 75],
  ['B2', 70],
  ['B3', 65],
  ['C4', 60],
  ['C5', 55],
  ['C6', 50],
  ['D7', 45],
  ['E8', 40],
  ['F9', 0],
];

export interface WaecSubjectGrade {
  readonly subjectId: WaecSubjectId;
  readonly grade: WaecGrade;
}

export function waecGradeFor(score: number): WaecGrade {
  for (const [grade, floor] of WAEC_GRADE_FLOORS) if (score >= floor) return grade;
  return 'F9';
}

/** C6 or better is a credit. */
export function isCreditGrade(grade: WaecGrade): boolean {
  return WAEC_GRADES.indexOf(grade) <= WAEC_GRADES.indexOf('C6');
}

/** Combine sittings, keeping each subject's best grade (universities accept combined results). */
export function bestWaecGrades(sittings: ReadonlyArray<readonly WaecSubjectGrade[]>): WaecSubjectGrade[] {
  const best = new Map<WaecSubjectId, WaecGrade>();
  for (const sitting of sittings) {
    for (const { subjectId, grade } of sitting) {
      const current = best.get(subjectId);
      if (!current || WAEC_GRADES.indexOf(grade) < WAEC_GRADES.indexOf(current)) best.set(subjectId, grade);
    }
  }
  return WAEC_SUBJECTS.filter((subject) => best.has(subject.id)).map((subject) => ({
    subjectId: subject.id,
    grade: best.get(subject.id) as WaecGrade,
  }));
}

export function waecCreditCount(grades: readonly WaecSubjectGrade[]): number {
  return grades.filter((entry) => isCreditGrade(entry.grade)).length;
}

export function hasWaecCredit(grades: readonly WaecSubjectGrade[], subjectId: WaecSubjectId): boolean {
  return grades.some((entry) => entry.subjectId === subjectId && isCreditGrade(entry.grade));
}

export function findWaecSubject(id: string): (typeof WAEC_SUBJECTS)[number] | undefined {
  return WAEC_SUBJECTS.find((subject) => subject.id === id);
}

// ---------------------------------------------------------------------------------------------------------------
// Exams, credentials and degree classes
// ---------------------------------------------------------------------------------------------------------------

export const EXAM_KINDS = ['jamb', 'waec-gce'] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];

export const COURSE_CREDENTIALS = ['nd', 'hnd', 'bachelors'] as const;
export type CourseCredential = (typeof COURSE_CREDENTIALS)[number];

export const DEGREE_CLASSES = [
  'first',
  'second-upper',
  'second-lower',
  'third',
  'pass',
  'distinction',
  'upper-credit',
  'lower-credit',
] as const;
export type DegreeClassId = (typeof DEGREE_CLASSES)[number];

export const DEGREE_CLASS_LABELS: Readonly<Record<DegreeClassId, { readonly long: string; readonly short: string }>> = {
  first: { long: 'First Class Honours', short: 'First Class' },
  'second-upper': { long: 'Second Class Upper', short: '2:1' },
  'second-lower': { long: 'Second Class Lower', short: '2:2' },
  third: { long: 'Third Class', short: 'Third' },
  pass: { long: 'Pass', short: 'Pass' },
  distinction: { long: 'Distinction', short: 'Distinction' },
  'upper-credit': { long: 'Upper Credit', short: 'Upper Credit' },
  'lower-credit': { long: 'Lower Credit', short: 'Lower Credit' },
};

/** Lowest CGPA (5-point scale) that still earns a qualification. */
export const MIN_GRADUATING_CGPA = 1;

/**
 * Class of degree from a 5-point CGPA. Universities: First ≥ 4.50, 2:1 ≥ 3.50, 2:2 ≥ 2.40, Third ≥ 1.50, Pass ≥ 1.00.
 * Polytechnic diplomas use the same bands as Distinction / Upper Credit / Lower Credit / Pass. Null = no award.
 */
export function degreeClassFor(cgpa: number, credential: CourseCredential): DegreeClassId | null {
  const value = Math.round(cgpa * 100) / 100;
  if (credential === 'bachelors') {
    if (value >= 4.5) return 'first';
    if (value >= 3.5) return 'second-upper';
    if (value >= 2.4) return 'second-lower';
    if (value >= 1.5) return 'third';
    if (value >= MIN_GRADUATING_CGPA) return 'pass';
    return null;
  }
  if (value >= 4.5) return 'distinction';
  if (value >= 3.5) return 'upper-credit';
  if (value >= 2.4) return 'lower-credit';
  if (value >= MIN_GRADUATING_CGPA) return 'pass';
  return null;
}

/** Post-UTME aggregate out of 100: UTME/8 (≤ 50) + screening (≤ 50) + any catchment bonus. */
export function admissionAggregate(utmeScore: number, screeningScore: number, bonus = 0): number {
  const utmePart = Math.min(50, Math.max(0, utmeScore) / 8);
  const screeningPart = Math.min(50, Math.max(0, screeningScore));
  return Math.round((utmePart + screeningPart + bonus) * 100) / 100;
}

/** "100L", "300L" at university; "ND1", "HND2" at polytechnic. */
export function levelLabel(level: number, credential: CourseCredential = 'bachelors'): string {
  if (credential === 'nd') return `ND${level}`;
  if (credential === 'hnd') return `HND${level}`;
  return `${level * 100}L`;
}

// ---------------------------------------------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------------------------------------------

/** Fee bands institutions price their programmes by. */
export const FEE_GROUPS = ['medicine', 'health', 'law', 'engineering', 'science', 'social', 'arts', 'nd', 'hnd'] as const;
export type FeeGroup = (typeof FEE_GROUPS)[number];

export interface CourseDefinition {
  readonly id: string;
  readonly name: string;
  /** Field recorded on the credential (matches `CredentialsSnapshot` degree fields used by careers). */
  readonly field: string;
  readonly credential: CourseCredential;
  /** Award prefix: "B.Sc", "MBBS", "LL.B", "ND"… */
  readonly award: string;
  readonly years: number;
  readonly feeGroup: FeeGroup;
  /** Semester mastery needed for a top grade, relative to a typical course (1 = 100 mastery points). */
  readonly difficulty: number;
  /** Skill the course builds. */
  readonly skill: SkillKey;
  /** WAEC credits required beyond English and Mathematics. */
  readonly requiredCredits: readonly WaecSubjectId[];
  /** Minimum WAEC credits (incl. English and Mathematics). */
  readonly minCredits: number;
  /** HND entry needs a completed ND in the same field instead of JAMB. */
  readonly requiresNd?: boolean;
  /** Programme to take after graduating (Law School, NMCN licence). */
  readonly next?: string;
  /** What graduates should do next, shown with the graduation notice. */
  readonly afterGraduation?: string;
}

const c = <const T extends CourseDefinition>(def: T): T => def;

export const COURSES = [
  c({ id: 'medicine', name: 'Medicine & Surgery', field: 'medicine', credential: 'bachelors', award: 'MBBS', years: 6, feeGroup: 'medicine', difficulty: 1.3, skill: 'medicine', requiredCredits: ['biology', 'chemistry', 'physics'], minCredits: 5, afterGraduation: 'Apply for the paid House Officer job in the Jobs app — one year of housemanship earns your MDCN licence.' }),
  c({ id: 'nursing', name: 'Nursing Science', field: 'nursing', credential: 'bachelors', award: 'B.NSc', years: 5, feeGroup: 'health', difficulty: 1.15, skill: 'medicine', requiredCredits: ['biology', 'chemistry', 'physics'], minCredits: 5, next: 'nmcn-licence', afterGraduation: 'Next: sit the NMCN licensing exam in the School app.' }),
  c({ id: 'law', name: 'Law', field: 'law', credential: 'bachelors', award: 'LL.B', years: 5, feeGroup: 'law', difficulty: 1.2, skill: 'law', requiredCredits: ['literature'], minCredits: 5, next: 'law-school', afterGraduation: 'Next stop: the Nigerian Law School (School app) — pass the Bar finals to be called to the Bar.' }),
  c({ id: 'engineering', name: 'Engineering', field: 'engineering', credential: 'bachelors', award: 'B.Eng', years: 5, feeGroup: 'engineering', difficulty: 1.2, skill: 'engineering', requiredCredits: ['physics', 'chemistry'], minCredits: 5 }),
  c({ id: 'computer-science', name: 'Computer Science', field: 'computer-science', credential: 'bachelors', award: 'B.Sc', years: 4, feeGroup: 'science', difficulty: 1.1, skill: 'tech', requiredCredits: ['physics'], minCredits: 5 }),
  c({ id: 'architecture', name: 'Architecture', field: 'architecture', credential: 'bachelors', award: 'B.Sc', years: 4, feeGroup: 'engineering', difficulty: 1.15, skill: 'engineering', requiredCredits: ['physics'], minCredits: 5 }),
  c({ id: 'accounting', name: 'Accounting', field: 'accounting', credential: 'bachelors', award: 'B.Sc', years: 4, feeGroup: 'social', difficulty: 1.05, skill: 'finance', requiredCredits: ['economics'], minCredits: 5 }),
  c({ id: 'economics', name: 'Economics', field: 'economics', credential: 'bachelors', award: 'B.Sc', years: 4, feeGroup: 'social', difficulty: 1.05, skill: 'finance', requiredCredits: ['economics'], minCredits: 5 }),
  c({ id: 'banking-finance', name: 'Banking & Finance', field: 'banking-finance', credential: 'bachelors', award: 'B.Sc', years: 4, feeGroup: 'social', difficulty: 1, skill: 'finance', requiredCredits: ['economics'], minCredits: 5 }),
  c({ id: 'business-admin', name: 'Business Administration', field: 'business-admin', credential: 'bachelors', award: 'B.Sc', years: 4, feeGroup: 'social', difficulty: 0.95, skill: 'business', requiredCredits: ['economics'], minCredits: 5 }),
  c({ id: 'mass-communication', name: 'Mass Communication', field: 'mass-communication', credential: 'bachelors', award: 'B.Sc', years: 4, feeGroup: 'social', difficulty: 0.95, skill: 'creative', requiredCredits: ['literature'], minCredits: 5 }),
  c({ id: 'political-science', name: 'Political Science', field: 'political-science', credential: 'bachelors', award: 'B.Sc', years: 4, feeGroup: 'social', difficulty: 0.95, skill: 'charisma', requiredCredits: ['government'], minCredits: 5 }),
  c({ id: 'education', name: 'Education', field: 'education', credential: 'bachelors', award: 'B.Ed', years: 4, feeGroup: 'arts', difficulty: 0.9, skill: 'charisma', requiredCredits: [], minCredits: 5 }),
  // Polytechnic: ND (2 years), then HND (2 years) in the same field.
  c({ id: 'nd-computer-science', name: 'Computer Science', field: 'computer-science', credential: 'nd', award: 'ND', years: 2, feeGroup: 'nd', difficulty: 0.9, skill: 'tech', requiredCredits: [], minCredits: 4 }),
  c({ id: 'nd-accountancy', name: 'Accountancy', field: 'accounting', credential: 'nd', award: 'ND', years: 2, feeGroup: 'nd', difficulty: 0.9, skill: 'finance', requiredCredits: ['economics'], minCredits: 4 }),
  c({ id: 'nd-mass-communication', name: 'Mass Communication', field: 'mass-communication', credential: 'nd', award: 'ND', years: 2, feeGroup: 'nd', difficulty: 0.85, skill: 'creative', requiredCredits: [], minCredits: 4 }),
  c({ id: 'nd-civil-engineering', name: 'Civil Engineering Technology', field: 'engineering', credential: 'nd', award: 'ND', years: 2, feeGroup: 'nd', difficulty: 0.95, skill: 'engineering', requiredCredits: ['physics'], minCredits: 4 }),
  c({ id: 'hnd-computer-science', name: 'Computer Science', field: 'computer-science', credential: 'hnd', award: 'HND', years: 2, feeGroup: 'hnd', difficulty: 0.95, skill: 'tech', requiredCredits: [], minCredits: 4, requiresNd: true }),
  c({ id: 'hnd-accountancy', name: 'Accountancy', field: 'accounting', credential: 'hnd', award: 'HND', years: 2, feeGroup: 'hnd', difficulty: 0.95, skill: 'finance', requiredCredits: [], minCredits: 4, requiresNd: true }),
  c({ id: 'hnd-mass-communication', name: 'Mass Communication', field: 'mass-communication', credential: 'hnd', award: 'HND', years: 2, feeGroup: 'hnd', difficulty: 0.9, skill: 'creative', requiredCredits: [], minCredits: 4, requiresNd: true }),
  c({ id: 'hnd-civil-engineering', name: 'Civil Engineering Technology', field: 'engineering', credential: 'hnd', award: 'HND', years: 2, feeGroup: 'hnd', difficulty: 1, skill: 'engineering', requiredCredits: [], minCredits: 4, requiresNd: true }),
] as const satisfies readonly CourseDefinition[];

export type CourseId = (typeof COURSES)[number]['id'];

const COURSE_INDEX: ReadonlyMap<string, CourseDefinition> = new Map(COURSES.map((course) => [course.id, course]));

export function findCourse(id: string): CourseDefinition | undefined {
  return COURSE_INDEX.get(id);
}

/** "B.Sc Accounting", "MBBS Medicine & Surgery", "ND Computer Science". */
export function courseTitle(course: CourseDefinition): string {
  return `${course.award} ${course.name}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------------------------------------------

export const INSTITUTION_KINDS = ['federal', 'state', 'private', 'polytechnic'] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

export const STRIKE_UNIONS = ['asuu', 'asup', 'none'] as const;
export type StrikeUnion = (typeof STRIKE_UNIONS)[number];

export interface CourseOffer {
  readonly courseId: CourseId;
  /** Aggregate cut-off out of 100 (UTME/8 + screening). */
  readonly cutoff: number;
}

export interface InstitutionDefinition {
  readonly id: string;
  /** Campus venue (same id as the VENUES entry). Out-of-town venues mean hostel life during sessions. */
  readonly venueId: VenueId;
  readonly name: string;
  readonly shortName: string;
  readonly kind: InstitutionKind;
  /** 0-100: how much employers and aunties are impressed. */
  readonly prestige: number;
  readonly strike: StrikeUnion;
  /** Institution's own minimum UTME score to sit its screening. */
  readonly minUtme: number;
  /** Annual tuition by fee group (₦, before the price index). */
  readonly tuition: Readonly<Partial<Record<FeeGroup, number>>>;
  /** Annual hostel (and compulsory feeding, where it applies) for out-of-town campuses; 0 for Lagos commuters. */
  readonly hostelFee: number;
  readonly acceptanceFee: number;
  /** Post-UTME screening / application form. */
  readonly screeningFee: number;
  /** Indigenes of this state get an aggregate bonus (catchment area). */
  readonly catchment?: { readonly stateId: string; readonly bonus: number };
  /** Indigenes of this state pay this fraction of tuition. */
  readonly indigeneDiscount?: { readonly stateId: string; readonly factor: number };
  readonly courses: readonly CourseOffer[];
}

const offer = (courseId: CourseId, cutoff: number): CourseOffer => ({ courseId, cutoff });
const i = <const T extends InstitutionDefinition>(def: T): T => def;

export const INSTITUTIONS = [
  i({
    id: 'unilag', venueId: 'unilag', name: 'University of Lagos', shortName: 'UNILAG', kind: 'federal', prestige: 92, strike: 'asuu', minUtme: 200,
    tuition: { medicine: 256_000, health: 210_000, law: 185_000, engineering: 190_000, science: 180_000, social: 170_000, arts: 165_000 },
    hostelFee: 0, acceptanceFee: 70_000, screeningFee: 2_000, catchment: { stateId: 'lagos', bonus: 3 },
    courses: [offer('medicine', 85), offer('nursing', 78), offer('law', 78), offer('engineering', 80), offer('computer-science', 80), offer('architecture', 74), offer('accounting', 74), offer('economics', 70), offer('banking-finance', 69), offer('business-admin', 70), offer('mass-communication', 72), offer('political-science', 68), offer('education', 58)],
  }),
  i({
    id: 'lasu', venueId: 'lasu', name: 'Lagos State University', shortName: 'LASU', kind: 'state', prestige: 70, strike: 'asuu', minUtme: 195,
    tuition: { medicine: 200_000, health: 180_000, law: 190_000, engineering: 185_000, science: 170_000, social: 150_000, arts: 120_000 },
    hostelFee: 0, acceptanceFee: 50_000, screeningFee: 2_000,
    catchment: { stateId: 'lagos', bonus: 3 }, indigeneDiscount: { stateId: 'lagos', factor: 0.3 },
    courses: [offer('medicine', 80), offer('nursing', 72), offer('law', 74), offer('engineering', 70), offer('computer-science', 70), offer('accounting', 70), offer('architecture', 68), offer('economics', 64), offer('banking-finance', 64), offer('business-admin', 64), offer('mass-communication', 66), offer('political-science', 60), offer('education', 52)],
  }),
  i({
    id: 'yabatech', venueId: 'yabatech', name: 'Yaba College of Technology', shortName: 'Yabatech', kind: 'polytechnic', prestige: 60, strike: 'asup', minUtme: 120,
    tuition: { nd: 44_500, hnd: 45_500 },
    hostelFee: 0, acceptanceFee: 25_000, screeningFee: 2_000,
    courses: [offer('nd-computer-science', 55), offer('nd-accountancy', 52), offer('nd-mass-communication', 52), offer('nd-civil-engineering', 50), offer('hnd-computer-science', 55), offer('hnd-accountancy', 52), offer('hnd-mass-communication', 50), offer('hnd-civil-engineering', 50)],
  }),
  i({
    id: 'pan-atlantic', venueId: 'pan-atlantic', name: 'Pan-Atlantic University', shortName: 'PAU', kind: 'private', prestige: 80, strike: 'none', minUtme: 170,
    tuition: { engineering: 6_300_000, science: 5_000_000, social: 4_100_000 },
    hostelFee: 0, acceptanceFee: 250_000, screeningFee: 25_000,
    courses: [offer('engineering', 62), offer('computer-science', 62), offer('accounting', 58), offer('economics', 58), offer('business-admin', 56), offer('mass-communication', 58), offer('banking-finance', 56), offer('architecture', 60), offer('political-science', 54)],
  }),
  i({
    id: 'fce-akoka', venueId: 'fce-akoka', name: 'Federal College of Education (Technical), Akoka', shortName: 'FCE Akoka', kind: 'federal', prestige: 45, strike: 'asup', minUtme: 150,
    tuition: { arts: 60_000, social: 62_000 },
    hostelFee: 0, acceptanceFee: 20_000, screeningFee: 2_000, catchment: { stateId: 'lagos', bonus: 2 },
    courses: [offer('education', 44)],
  }),
  i({
    id: 'lasustech', venueId: 'lasustech', name: 'Lagos State University of Science and Technology', shortName: 'LASUSTECH', kind: 'state', prestige: 58, strike: 'asuu', minUtme: 180,
    tuition: { health: 150_000, engineering: 150_000, science: 140_000, social: 125_000, arts: 105_000 },
    hostelFee: 0, acceptanceFee: 40_000, screeningFee: 2_000,
    catchment: { stateId: 'lagos', bonus: 3 }, indigeneDiscount: { stateId: 'lagos', factor: 0.35 },
    courses: [offer('engineering', 64), offer('computer-science', 64), offer('architecture', 62), offer('accounting', 62), offer('economics', 58), offer('banking-finance', 58), offer('business-admin', 56), offer('mass-communication', 58), offer('education', 46)],
  }),
  i({
    id: 'caleb', venueId: 'caleb', name: 'Caleb University', shortName: 'Caleb', kind: 'private', prestige: 66, strike: 'none', minUtme: 160,
    tuition: { medicine: 4_300_000, health: 2_100_000, law: 1_900_000, engineering: 1_700_000, science: 1_400_000, social: 1_200_000, arts: 800_000 },
    hostelFee: 0, acceptanceFee: 120_000, screeningFee: 15_000,
    courses: [offer('medicine', 68), offer('nursing', 58), offer('law', 60), offer('engineering', 56), offer('computer-science', 54), offer('accounting', 52), offer('economics', 50), offer('banking-finance', 50), offer('business-admin', 48), offer('mass-communication', 50), offer('political-science', 48), offer('education', 46)],
  }),
  i({
    id: 'anchor', venueId: 'anchor', name: 'Anchor University', shortName: 'Anchor', kind: 'private', prestige: 62, strike: 'none', minUtme: 150,
    tuition: { medicine: 4_800_000, health: 2_600_000, law: 2_400_000, engineering: 2_000_000, science: 1_600_000, social: 1_400_000 },
    hostelFee: 0, acceptanceFee: 100_000, screeningFee: 15_000,
    courses: [offer('medicine', 66), offer('nursing', 56), offer('law', 58), offer('engineering', 54), offer('computer-science', 52), offer('accounting', 50), offer('economics', 48), offer('banking-finance', 48), offer('business-admin', 46), offer('mass-communication', 48), offer('political-science', 46)],
  }),
  i({
    id: 'augustine', venueId: 'augustine', name: 'Augustine University', shortName: 'Augustine', kind: 'private', prestige: 60, strike: 'none', minUtme: 150,
    tuition: { medicine: 4_500_000, health: 2_300_000, law: 2_100_000, science: 1_300_000, social: 1_100_000, arts: 700_000 },
    hostelFee: 0, acceptanceFee: 90_000, screeningFee: 12_000,
    courses: [offer('medicine', 66), offer('nursing', 56), offer('law', 58), offer('computer-science', 52), offer('accounting', 50), offer('economics', 48), offer('mass-communication', 50), offer('political-science', 48), offer('education', 44)],
  }),
  i({
    id: 'ekounimed', venueId: 'ekounimed', name: 'Eko University of Medicine and Health Sciences', shortName: 'EKOUNIMED', kind: 'private', prestige: 64, strike: 'none', minUtme: 170,
    tuition: { medicine: 5_200_000, health: 2_800_000 },
    hostelFee: 0, acceptanceFee: 120_000, screeningFee: 15_000,
    courses: [offer('medicine', 70), offer('nursing', 62)],
  }),
  // Abuja (docs/MULTI_CITY.md): the federal university on the Airport Road and two private universities in Jabi.
  i({
    id: 'university-of-abuja', venueId: 'university-of-abuja', name: 'University of Abuja', shortName: 'UniAbuja', kind: 'federal', prestige: 74, strike: 'asuu', minUtme: 190,
    tuition: { medicine: 240_000, health: 200_000, law: 180_000, engineering: 185_000, science: 175_000, social: 165_000, arts: 150_000 },
    hostelFee: 0, acceptanceFee: 60_000, screeningFee: 2_000, catchment: { stateId: 'fct', bonus: 3 },
    courses: [offer('medicine', 80), offer('nursing', 72), offer('law', 74), offer('engineering', 70), offer('computer-science', 70), offer('accounting', 68), offer('economics', 64), offer('banking-finance', 62), offer('business-admin', 62), offer('mass-communication', 64), offer('political-science', 58), offer('education', 50)],
  }),
  i({
    id: 'baze-university', venueId: 'baze-university', name: 'Baze University', shortName: 'Baze', kind: 'private', prestige: 72, strike: 'none', minUtme: 160,
    tuition: { medicine: 5_500_000, health: 3_000_000, law: 2_800_000, engineering: 2_600_000, science: 2_200_000, social: 1_900_000, arts: 1_300_000 },
    hostelFee: 0, acceptanceFee: 150_000, screeningFee: 20_000,
    courses: [offer('medicine', 68), offer('nursing', 60), offer('law', 62), offer('engineering', 58), offer('computer-science', 56), offer('architecture', 56), offer('accounting', 54), offer('economics', 52), offer('banking-finance', 52), offer('business-admin', 50), offer('mass-communication', 52), offer('political-science', 50)],
  }),
  i({
    id: 'nile-university', venueId: 'nile-university', name: 'Nile University of Nigeria', shortName: 'Nile', kind: 'private', prestige: 70, strike: 'none', minUtme: 160,
    tuition: { engineering: 2_700_000, science: 2_300_000, social: 2_000_000, arts: 1_400_000, law: 2_900_000 },
    hostelFee: 0, acceptanceFee: 140_000, screeningFee: 20_000,
    courses: [offer('engineering', 58), offer('computer-science', 56), offer('architecture', 56), offer('accounting', 54), offer('economics', 52), offer('banking-finance', 52), offer('business-admin', 50), offer('law', 62), offer('mass-communication', 52), offer('political-science', 50)],
  }),
] as const satisfies readonly InstitutionDefinition[];

export type InstitutionId = (typeof INSTITUTIONS)[number]['id'];

const INSTITUTION_INDEX: ReadonlyMap<string, InstitutionDefinition> = new Map(INSTITUTIONS.map((institution) => [institution.id, institution]));

export function findInstitution(id: string): InstitutionDefinition | undefined {
  return INSTITUTION_INDEX.get(id);
}

export function institutionByVenue(venueId: string): InstitutionDefinition | undefined {
  return INSTITUTIONS.find((institution) => institution.venueId === venueId);
}

export function findCourseOffer(institution: InstitutionDefinition, courseId: string): CourseOffer | undefined {
  return institution.courses.find((entry) => entry.courseId === courseId);
}

/** National UTME floor for the institution type (polytechnics accept lower scores). */
export function nationalMinimumUtme(institution: InstitutionDefinition): number {
  return institution.kind === 'polytechnic' ? JAMB_MIN_POLYTECHNIC : JAMB_MIN_UNIVERSITY;
}

/** Effective UTME minimum: the higher of the national floor and the institution's own threshold. */
export function minimumUtmeFor(institution: InstitutionDefinition): number {
  return Math.max(nationalMinimumUtme(institution), institution.minUtme);
}

export function isIndigeneOf(institution: InstitutionDefinition, stateOfOrigin: string): boolean {
  return institution.indigeneDiscount?.stateId === stateOfOrigin;
}

/** Annual tuition for a course (base ₦, before the price index), after any indigene discount. */
export function annualTuition(institution: InstitutionDefinition, course: CourseDefinition, stateOfOrigin: string): number {
  const base = institution.tuition[course.feeGroup] ?? 0;
  const discount = institution.indigeneDiscount;
  return discount && discount.stateId === stateOfOrigin ? Math.round(base * discount.factor) : base;
}

/** Tuition + hostel for one session (base ₦, before the price index). */
export function sessionFees(institution: InstitutionDefinition, course: CourseDefinition, stateOfOrigin: string): number {
  return annualTuition(institution, course, stateOfOrigin) + institution.hostelFee;
}

/** Strikes that shut this institution (ASUU for universities, ASUP for polytechnics, none for private). */
export function strikeEventKind(institution: InstitutionDefinition): 'asuu-strike' | 'asup-strike' | null {
  if (institution.strike === 'asuu') return 'asuu-strike';
  if (institution.strike === 'asup') return 'asup-strike';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Professional programmes & certifications
// ---------------------------------------------------------------------------------------------------------------

/** One way to qualify for a programme; a programme lists alternatives (any one is enough). */
export interface ProgrammeRequirement {
  /** A completed bachelor's degree in one of these fields. */
  readonly degreeFields?: readonly string[];
  /** Any completed bachelor's degree or HND. */
  readonly anyDegree?: boolean;
  /** A certification already held (e.g. the previous ICAN level). */
  readonly certification?: string;
  /** WAEC credits incl. English and Mathematics. */
  readonly waecCredits?: number;
  readonly minSkill?: Partial<Record<SkillKey, number>>;
}

export interface ProgrammeDefinition {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly blurb: string;
  /** Total cost (₦, before the price index). */
  readonly cost: number;
  readonly durationDays: number;
  /** Certification code granted on passing (`CredentialsSnapshot.certifications`). */
  readonly grants: string;
  /** Alternatives; empty = open to everyone. */
  readonly requires: readonly ProgrammeRequirement[];
  /** Skill that drives the pass chance. */
  readonly skill: SkillKey;
  /** Actions whose completion counts as preparation. */
  readonly prepActions: readonly string[];
  /** Prep hours that max out the preparation bonus. */
  readonly prepHoursTarget: number;
  /** Skill XP granted on passing. */
  readonly skillXpOnPass?: Partial<Record<SkillKey, number>>;
  /** Weekday classes at a venue (bootcamps). */
  readonly schedule?: { readonly venueId: VenueId; readonly startHour: number; readonly endHour: number };
  /** Scored exam (IELTS band 4.0-9.0) instead of pass/fail. */
  readonly scored?: boolean;
}

const p = <const T extends ProgrammeDefinition>(def: T): T => def;

export const PROGRAMMES = [
  p({
    id: 'law-school', name: 'Nigerian Law School (Bar Finals)', provider: 'Council of Legal Education',
    blurb: 'One year of wig, gown and dinners, then the Bar finals. Pass and you’re called to the Nigerian Bar.',
    cost: 476_000, durationDays: 360, grants: 'bar', requires: [{ degreeFields: ['law'] }], skill: 'law',
    prepActions: ['study'], prepHoursTarget: 60, skillXpOnPass: { law: 10 },
  }),
  p({
    id: 'nmcn-licence', name: 'NMCN Licensing Exam', provider: 'Nursing and Midwifery Council of Nigeria',
    blurb: 'The licensing exam every nurse must pass before wearing the cap for real.',
    cost: 85_000, durationDays: 30, grants: 'nmcn', requires: [{ degreeFields: ['nursing'] }], skill: 'medicine',
    prepActions: ['study'], prepHoursTarget: 20, skillXpOnPass: { medicine: 4 },
  }),
  p({
    id: 'coren-registration', name: 'COREN Registration', provider: 'Council for the Regulation of Engineering in Nigeria',
    blurb: 'Professional interview and registration — the "Engr." before your name becomes official.',
    cost: 100_000, durationDays: 60, grants: 'coren', requires: [{ degreeFields: ['engineering'] }], skill: 'engineering',
    prepActions: ['study'], prepHoursTarget: 20,
  }),
  p({
    id: 'ican-foundation', name: 'ICAN Foundation Level', provider: 'Institute of Chartered Accountants of Nigeria',
    blurb: 'First step to ACA. Business law, management information, basic accounting.',
    cost: 120_000, durationDays: 120, grants: 'ican-foundation', requires: [{ waecCredits: 5 }], skill: 'finance',
    prepActions: ['study'], prepHoursTarget: 30, skillXpOnPass: { finance: 5 },
  }),
  p({
    id: 'ican-skills', name: 'ICAN Skills Level', provider: 'Institute of Chartered Accountants of Nigeria',
    blurb: 'Financial reporting, audit, tax. Accounting graduates are exempted from Foundation.',
    cost: 160_000, durationDays: 120, grants: 'ican-skills', requires: [{ certification: 'ican-foundation' }, { degreeFields: ['accounting'] }], skill: 'finance',
    prepActions: ['study'], prepHoursTarget: 40, skillXpOnPass: { finance: 6 },
  }),
  p({
    id: 'ican-professional', name: 'ICAN Professional Level (ACA)', provider: 'Institute of Chartered Accountants of Nigeria',
    blurb: 'The final level. Pass it and you’re a Chartered Accountant — Big-4 doors open.',
    cost: 200_000, durationDays: 150, grants: 'ican', requires: [{ certification: 'ican-skills' }], skill: 'finance',
    prepActions: ['study'], prepHoursTarget: 50, skillXpOnPass: { finance: 8 },
  }),
  p({
    id: 'cloud-certification', name: 'Cloud Solutions Architect Certification', provider: 'Cloud vendor (online proctored)',
    blurb: 'Dollar-priced exam, dollar-paying jobs. Needs some tech skill first.',
    cost: 220_000, durationDays: 30, grants: 'cloud', requires: [{ minSkill: { tech: 20 } }], skill: 'tech',
    prepActions: ['study', 'learn-code'], prepHoursTarget: 25, skillXpOnPass: { tech: 4 },
  }),
  p({
    id: 'tech-bootcamp', name: 'Software Engineering Bootcamp', provider: 'Yaba Tech Hub Academy',
    blurb: 'Six months, weekdays 10:00-14:00 in Yaba. No degree needed — just a laptop and grit.',
    cost: 650_000, durationDays: 180, grants: 'bootcamp', requires: [], skill: 'tech',
    prepActions: ['study', 'learn-code'], prepHoursTarget: 40, skillXpOnPass: { tech: 20 },
    schedule: { venueId: 'yaba-hub', startHour: 10, endHour: 14 },
  }),
  p({
    id: 'pmp-certification', name: 'Project Management Professional (PMP)', provider: 'PMI (online proctored)',
    blurb: 'For graduates who want to manage the project, not do the project.',
    cost: 450_000, durationDays: 60, grants: 'pmp', requires: [{ anyDegree: true }], skill: 'business',
    prepActions: ['study'], prepHoursTarget: 30, skillXpOnPass: { business: 5 },
  }),
  p({
    id: 'ielts', name: 'IELTS Academic', provider: 'British Council Lagos',
    blurb: 'The japa exam. Your band score goes with you to every visa application.',
    cost: 300_000, durationDays: 14, grants: 'ielts', requires: [], skill: 'charisma',
    prepActions: ['study'], prepHoursTarget: 20, scored: true,
  }),
] as const satisfies readonly ProgrammeDefinition[];

export type ProgrammeId = (typeof PROGRAMMES)[number]['id'];

const PROGRAMME_INDEX: ReadonlyMap<string, ProgrammeDefinition> = new Map(PROGRAMMES.map((programme) => [programme.id, programme]));

export function findProgramme(id: string): ProgrammeDefinition | undefined {
  return PROGRAMME_INDEX.get(id);
}

/** Labels for certification codes, including those granted by other domains. */
export const CERTIFICATION_LABELS: Readonly<Record<string, string>> = {
  bar: 'Called to the Nigerian Bar (BL)',
  mdcn: 'MDCN Full Registration',
  nmcn: 'NMCN Nursing Licence',
  coren: 'COREN Registered Engineer',
  'ican-foundation': 'ICAN Foundation Level',
  'ican-skills': 'ICAN Skills Level',
  ican: 'Chartered Accountant (ACA)',
  cloud: 'Cloud Solutions Architect',
  bootcamp: 'Software Engineering Bootcamp',
  pmp: 'PMP Certified',
  ielts: 'IELTS Academic',
  'drivers-licence': 'FRSC Driver’s Licence',
  ppl: 'Private Pilot Licence (PPL)',
  nysc: 'NYSC Certificate of National Service',
};

export function certificationLabel(code: string): string {
  return CERTIFICATION_LABELS[code] ?? code.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
