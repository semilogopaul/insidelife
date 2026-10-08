import {
  JAMB_MAX_SCORE,
  MINUTES_PER_DAY,
  WAEC_SUBJECTS,
  moodPerformanceMultiplier,
  waecGradeFor,
  type Rng,
  type WaecGrade,
  type WaecSubjectId,
} from '@insidelife/shared';

/**
 * Pure education rules: exam scores, grades and timelines. No I/O, no Nest — every function takes an `Rng` (seeded by
 * the caller) or plain numbers, so outcomes are deterministic and unit-testable.
 */

export interface ScoredSubject {
  readonly subjectId: WaecSubjectId;
  readonly grade: WaecGrade;
  readonly score: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Diminishing returns on preparation: 0 → 0, `target` hours → ~0.63, 3× target → ~0.95. */
export function prepFactor(hours: number, target: number): number {
  if (hours <= 0 || target <= 0) return 0;
  return 1 - Math.exp(-hours / target);
}

function rollSubjects(rng: Rng, mean: number, spread: number): ScoredSubject[] {
  // A shared "form on the day" term makes results correlated: some candidates do well across the board.
  const form = rng.normal(0, 4);
  return WAEC_SUBJECTS.map((subject) => {
    const score = Math.round(clamp(rng.normal(mean + form, spread), 0, 100));
    return { subjectId: subject.id, grade: waecGradeFor(score), score };
  });
}

/** School WAEC at 17: driven by the birth-lottery background (`waecMean` credits out of 9) and book sense. */
export function rollWaecResult(rng: Rng, input: { readonly waecMean: number; readonly intellect: number }): ScoredSubject[] {
  const typicalIntellect = input.waecMean * 4 + 5;
  const mean = 32 + input.waecMean * 4 + 0.5 * (input.intellect - typicalIntellect);
  return rollSubjects(rng, mean, 12);
}

/** WAEC GCE (private candidate resit): book sense, preparation and mood on the day. */
export function rollGceResult(rng: Rng, input: { readonly intellect: number; readonly prepHours: number; readonly mood: number }): ScoredSubject[] {
  const mean = 30 + input.intellect * 0.5 + 8 * prepFactor(input.prepHours, 15) + (moodPerformanceMultiplier(input.mood) - 1) * 20;
  return rollSubjects(rng, mean, 11);
}

/**
 * JAMB UTME score (0-400). Calibrated so a typical candidate with a few hours of prep lands around 170-200
 * (median ~190 across players), 250+ is strong and 300+ is rare — it takes serious book sense and preparation.
 */
export function jambScore(rng: Rng, input: { readonly intellect: number; readonly prepHours: number; readonly mood: number }): number {
  const base = 112 + input.intellect * 1.5;
  const prep = 62 * prepFactor(input.prepHours, 22);
  const mood = (moodPerformanceMultiplier(input.mood) - 1) * 70;
  const luck = rng.normal(0, 24);
  return Math.round(clamp(base + prep + mood + luck, 0, JAMB_MAX_SCORE));
}

/** Post-UTME screening score (0-50). */
export function screeningScore(rng: Rng, input: { readonly intellect: number; readonly mood: number }): number {
  const mean = 16 + input.intellect * 0.42 + (moodPerformanceMultiplier(input.mood) - 1) * 12;
  return Math.round(clamp(rng.normal(mean, 6), 0, 50) * 10) / 10;
}

/** HND direct entry: ND CGPA (5-point) replaces UTME/8. */
export function hndEntryPoints(ndCgpa: number): number {
  return clamp(ndCgpa * 10, 0, 50);
}

/** Chance of making the supplementary list when the aggregate falls just short. */
export function supplementaryChance(shortfall: number, margin: number, connections: number): number {
  if (shortfall <= 0) return 1;
  if (shortfall > margin) return 0;
  return clamp(0.35 * (1 - shortfall / (margin + 1)) + connections / 250, 0, 0.6);
}

export interface SemesterInput {
  /** Mastery points earned this semester. */
  readonly mastery: number;
  /** Mastery points for a top grade (100 × course difficulty). */
  readonly requirement: number;
  /** 0-1 lecture attendance. */
  readonly attendance: number;
  readonly mood: number;
}

/**
 * Semester GPA on the 5-point scale. Mastery against the course requirement carries most weight (65%), then
 * attendance (20%) and how you're holding up (15%), plus a little exam-hall luck.
 * Full attendance alone lands around a 2:2/2:1 border; self-study on top is what makes a First.
 */
export function semesterGpa(rng: Rng, input: SemesterInput): number {
  const masteryRatio = input.requirement > 0 ? input.mastery / input.requirement : 0;
  const masteryPart = clamp(masteryRatio / 1.2, 0, 1);
  const attendancePart = clamp(input.attendance, 0, 1);
  const moodPart = clamp((moodPerformanceMultiplier(input.mood) - 0.6) / 0.65, 0, 1);
  const performance = 0.65 * masteryPart + 0.2 * attendancePart + 0.15 * moodPart;
  return round2(clamp(5 * performance + rng.normal(0, 0.25), 0, 5));
}

/** Cumulative GPA (equal-weight semesters). */
export function cumulativeGpa(gpas: readonly number[]): number | null {
  if (gpas.length === 0) return null;
  return round2(gpas.reduce((sum, gpa) => sum + gpa, 0) / gpas.length);
}

/** Mastery points per hour of lectures attended / self-study (before the learning factor and mood). */
export const LECTURE_MASTERY_PER_HOUR = 0.1;
export const STUDY_MASTERY_PER_HOUR = 1;
/** Self-study in the campus library counts extra. */
export const CAMPUS_STUDY_BONUS = 1.2;

/** How quickly a student turns hours into mastery: book sense 30 → 0.9, 60 → 1.2. */
export function learningFactor(intellect: number): number {
  return clamp(0.6 + intellect / 100, 0.6, 1.6);
}

/**
 * Progress a programme makes in one day: a full day unless the campus was on strike (strike minutes don't count) or
 * the student was suspended.
 */
export function dailyProgressMinutes(strikeMinutesToday: number, suspended: boolean): number {
  if (suspended) return 0;
  return Math.max(0, MINUTES_PER_DAY - strikeMinutesToday);
}

/** Graduation date pushed back by strikes and suspension so far. */
export function strikeAdjustedEnd(plannedEnd: number, strikeMinutes: number, pausedMinutes: number): number {
  return plannedEnd + Math.max(0, strikeMinutes) + Math.max(0, pausedMinutes);
}

/** Programme exam pass chance from the relevant skill (0-100) and preparation. */
export function programmePassChance(skill: number, prepHours: number, prepTarget: number): number {
  return clamp(0.3 + (skill / 100) * 0.4 + prepFactor(prepHours, prepTarget) * 0.35, 0.15, 0.97);
}

/** IELTS band (4.0-9.0 in half bands) from book sense, charisma and prep. */
export function ieltsBand(rng: Rng, input: { readonly intellect: number; readonly charisma: number; readonly prepHours: number }): number {
  const raw = 3.6 + input.intellect / 25 + input.charisma / 40 + prepFactor(input.prepHours, 12) * 1.2 + rng.normal(0, 0.35);
  return clamp(Math.round(raw * 2) / 2, 4, 9);
}
