import { describe, expect, it } from 'vitest';
import { BASE_USD_RATE } from '../world/world.js';
import { COURSES, INSTITUTIONS } from './education.js';
import {
  CAREER_EDUCATION_LEVELS,
  JOBS,
  JOB_DEGREE_EDUCATION,
  JOB_DEGREE_PAY_THRESHOLD_NGN,
  JOB_MAX_MONTHLY_NGN,
  JOB_MAX_MONTHLY_USD,
  educationRank,
  fieldMatches,
  jobPayInNaira,
  payNeedsDegree,
  type JobDefinition,
} from './careers.js';
import { ACTIONS } from './actions.js';
import { findVenue } from './venues.js';

const rank = (level: Parameters<typeof educationRank>[0] | undefined): number => educationRank(level ?? 'none');

/** The qualification a level asks for: a promotion gate on the level itself, or the job's entry requirement. */
const levelEducation = (job: JobDefinition, index: number): number => Math.max(rank(job.levels[index]?.education), rank(job.requirements.education));

describe('salary rules', () => {
  it('caps dollar jobs at the dollar amount worth ₦10m at the base rate', () => {
    expect(JOB_MAX_MONTHLY_USD).toBe(Math.floor(JOB_MAX_MONTHLY_NGN / BASE_USD_RATE));
    expect(JOB_MAX_MONTHLY_USD * BASE_USD_RATE).toBeLessThanOrEqual(JOB_MAX_MONTHLY_NGN);
    expect((JOB_MAX_MONTHLY_USD + 1) * BASE_USD_RATE).toBeGreaterThan(JOB_MAX_MONTHLY_NGN);
  });

  it('pays no level of any job more than ₦10m a month (dollar jobs: the ₦10m equivalent)', () => {
    for (const job of JOBS) {
      job.levels.forEach((level) => {
        expect(jobPayInNaira(job.currency, level.pay), `${job.id} ${level.title}`).toBeLessThanOrEqual(JOB_MAX_MONTHLY_NGN);
      });
    }
    expect(JOBS.some((job) => job.levels.some((level) => level.pay === JOB_MAX_MONTHLY_NGN))).toBe(true);
    expect(JOBS.some((job) => job.currency === 'USD' && job.levels.some((level) => level.pay === JOB_MAX_MONTHLY_USD))).toBe(true);
  });

  it('asks for an HND or degree at every level paying ₦3m a month or more', () => {
    let gated = 0;
    for (const job of JOBS.filter((candidate) => !candidate.degreeExempt)) {
      job.levels.forEach((level, index) => {
        if (!payNeedsDegree(job.currency, level.pay)) return;
        gated++;
        expect(jobPayInNaira(job.currency, level.pay)).toBeGreaterThanOrEqual(JOB_DEGREE_PAY_THRESHOLD_NGN);
        expect(levelEducation(job, index), `${job.id} ${level.title}`).toBeGreaterThanOrEqual(educationRank(JOB_DEGREE_EDUCATION));
      });
    }
    expect(gated).toBeGreaterThan(20);
  });

  it('exempts only professional football from the degree rule (the cap still applies)', () => {
    expect(JOBS.filter((job) => job.degreeExempt).map((job) => job.id)).toEqual(['football-career']);
  });

  it('does not ask for a degree below ₦3m unless the job already does', () => {
    for (const job of JOBS) {
      job.levels.forEach((level) => {
        if (!payNeedsDegree(job.currency, level.pay) && level.education) expect(rank(level.education), `${job.id} ${level.title}`).toBeLessThan(rank('hnd'));
      });
    }
  });

  it('never asks for more than a bachelor’s degree, and degree requirements never fall up the ladder', () => {
    for (const job of JOBS) {
      let previous = 0;
      job.levels.forEach((level, index) => {
        const needed = levelEducation(job, index);
        expect(needed, `${job.id} ${level.title}`).toBeLessThanOrEqual(educationRank('bachelors'));
        if (index > 0) expect(needed, `${job.id} ${level.title}`).toBeGreaterThanOrEqual(previous);
        previous = needed;
      });
    }
  });

  it('keeps every ladder reachable: a polytechnic or university course gives each required level (and field)', () => {
    for (const job of JOBS) {
      job.levels.forEach((level, index) => {
        const needed = levelEducation(job, index);
        const neededLevel = CAREER_EDUCATION_LEVELS[needed];
        if (!neededLevel || needed <= rank('ssce')) return;
        const fields = job.requirements.fields;
        const courses = COURSES.filter(
          (course) => rank(course.credential) >= needed && (!fields || fields.length === 0 || fields.some((field) => fieldMatches(field, course.field))),
        );
        expect(courses.length, `${job.id} ${level.title} needs ${neededLevel}`).toBeGreaterThan(0);
        expect(
          INSTITUTIONS.some((institution) => institution.courses.some((offer) => courses.some((course) => course.id === offer.courseId))),
          `${job.id} ${level.title}`,
        ).toBe(true);
      });
    }
  });
});

describe('football career', () => {
  const football = JOBS.find((job) => job.id === 'football-career');

  it('runs academy trainee → NPFL player → captain → Super Eagles → a club abroad, from a Lagos stadium, on fitness', () => {
    expect(football?.levels.map((level) => level.title)).toEqual(
      expect.arrayContaining(['Academy trainee', 'NPFL first-team player', 'NPFL club captain', 'Super Eagles international']),
    );
    expect(football?.levels[0]?.title).toBe('Academy trainee');
    expect(football?.levels.at(-1)?.title).toBe('Pro abroad (European league)');
    expect(football?.levels.at(-1)?.pay).toBeLessThanOrEqual(JOB_MAX_MONTHLY_NGN);
    expect(football?.levels.every((level) => !level.education)).toBe(true);
    expect(football?.requirements.skills?.fitness).toBeGreaterThan(0);
    expect(football?.levels.some((level) => (level.skills?.fitness ?? 0) >= 60)).toBe(true);
    const workplace = findVenue(football?.workplaceId ?? '');
    expect(workplace?.type).toBe('stadium');
    expect(workplace?.districtId).toBe('surulere');
  });

  it('has training and match-day actions at the stadium and needs no degree', () => {
    const training = ACTIONS.find((action) => action.id === 'football-training');
    expect(training?.where.venueTypes).toEqual(['stadium']);
    expect(training?.fitnessPerHour).toBeGreaterThan(1);
    expect(ACTIONS.find((action) => action.id === 'football-match')?.where.venueTypes).toEqual(['stadium']);
    expect(football?.requirements.education).toBeUndefined();
    expect(football?.levels.some((level) => level.pay >= JOB_DEGREE_PAY_THRESHOLD_NGN)).toBe(true);
  });
});
