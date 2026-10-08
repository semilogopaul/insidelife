import {
  COURSES,
  INSTITUTIONS,
  MINUTES_PER_DAY,
  MINUTES_PER_YEAR,
  PROGRAMMES,
  admissionAggregate,
  bestWaecGrades,
  createRng,
  degreeClassFor,
  findCourse,
  findVenue,
  isCreditGrade,
  waecCreditCount,
  waecGradeFor,
  worldEventMinutesBetween,
  worldEventsForYear,
  hasWaecCredit,
  annualTuition,
  findInstitution,
  levelLabel,
  sessionFees,
  type InstitutionDefinition,
  type ProgrammeDefinition,
} from '@insidelife/shared';
import {
  cumulativeGpa,
  dailyProgressMinutes,
  ieltsBand,
  jambScore,
  programmePassChance,
  rollGceResult,
  rollWaecResult,
  semesterGpa,
  strikeAdjustedEnd,
  supplementaryChance,
} from './education.rules.js';

const quantile = (sorted: readonly number[], q: number): number => sorted[Math.floor((sorted.length - 1) * q)] ?? 0;

function averageJamb(input: { intellect: number; prepHours: number; mood: number }): number {
  let total = 0;
  for (let i = 0; i < 2_000; i++) total += jambScore(createRng(`avg:${i}`), input);
  return total / 2_000;
}

function averageGceCredits(intellect: number, prepHours: number): number {
  let credits = 0;
  for (let i = 0; i < 2_000; i++) credits += waecCreditCount(rollGceResult(createRng(`gce:${intellect}:${prepHours}:${i}`), { intellect, prepHours, mood: 60 }));
  return credits / 2_000;
}

function meanGpa(input: Parameters<typeof semesterGpa>[1]): number {
  let total = 0;
  for (let i = 0; i < 1_000; i++) total += semesterGpa(createRng(`gpa:${i}`), input);
  return total / 1_000;
}

describe('JAMB score', () => {
  it('stays within 0-400 and is deterministic for the same seed', () => {
    const input = { intellect: 35, prepHours: 12, mood: 65 };
    expect(jambScore(createRng('seed:jamb:1'), input)).toBe(jambScore(createRng('seed:jamb:1'), input));
    for (let i = 0; i < 2_000; i++) {
      const score = jambScore(createRng(`bounds:${i}`), { intellect: i % 100, prepHours: i % 200, mood: i % 101 });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(400);
    }
  });

  it('has a realistic distribution across typical candidates (median ~190, 250+ strong, 300+ rare)', () => {
    const population = createRng('population');
    const scores: number[] = [];
    for (let i = 0; i < 20_000; i++) {
      const prepHours = population.float(0, 20);
      // Studying also builds book sense (≈ +1.2 intellect per hour early on).
      const intellect = population.int(20, 38) + prepHours * 1.2;
      const mood = population.normal(62, 10);
      scores.push(jambScore(createRng(`candidate:${i}`), { intellect, prepHours, mood }));
    }
    scores.sort((a, b) => a - b);
    const share = (min: number): number => scores.filter((score) => score >= min).length / scores.length;

    expect(quantile(scores, 0.5)).toBeGreaterThanOrEqual(175);
    expect(quantile(scores, 0.5)).toBeLessThanOrEqual(205);
    expect(share(250)).toBeGreaterThan(0.02);
    expect(share(250)).toBeLessThan(0.15);
    expect(share(300)).toBeLessThan(0.02);
  });

  it('rewards preparation and book sense', () => {
    const lazy = averageJamb({ intellect: 28, prepHours: 0, mood: 60 });
    const prepared = averageJamb({ intellect: 28, prepHours: 30, mood: 60 });
    const brilliant = averageJamb({ intellect: 70, prepHours: 60, mood: 85 });
    expect(prepared).toBeGreaterThan(lazy + 30);
    expect(brilliant).toBeGreaterThan(270);
  });
});

describe('WAEC', () => {
  it('maps raw scores to WAEC grades with C6 as the lowest credit', () => {
    expect(waecGradeFor(80)).toBe('A1');
    expect(waecGradeFor(75)).toBe('A1');
    expect(waecGradeFor(74)).toBe('B2');
    expect(waecGradeFor(50)).toBe('C6');
    expect(waecGradeFor(49)).toBe('D7');
    expect(waecGradeFor(10)).toBe('F9');
    expect(isCreditGrade('C6')).toBe(true);
    expect(isCreditGrade('D7')).toBe(false);
  });

  it('averages roughly the background’s expected credits', () => {
    for (const waecMean of [5, 6, 7]) {
      let credits = 0;
      for (let i = 0; i < 3_000; i++) {
        const intellect = waecMean * 4 + (i % 11);
        credits += waecCreditCount(rollWaecResult(createRng(`waec:${waecMean}:${i}`), { waecMean, intellect }));
      }
      expect(credits / 3_000).toBeGreaterThan(waecMean - 0.6);
      expect(credits / 3_000).toBeLessThan(waecMean + 0.6);
    }
  });

  it('makes a GCE resit a real but earned improvement', () => {
    expect(averageGceCredits(28, 0)).toBeLessThan(5);
    expect(averageGceCredits(45, 15)).toBeGreaterThan(averageGceCredits(28, 0) + 1.5);
    expect(averageGceCredits(45, 15)).toBeLessThan(8);
  });

  it('combines sittings keeping the best grade per subject', () => {
    const best = bestWaecGrades([
      [
        { subjectId: 'english', grade: 'D7' },
        { subjectId: 'mathematics', grade: 'B3' },
      ],
      [
        { subjectId: 'english', grade: 'C5' },
        { subjectId: 'mathematics', grade: 'F9' },
      ],
    ]);
    expect(best).toEqual([
      { subjectId: 'english', grade: 'C5' },
      { subjectId: 'mathematics', grade: 'B3' },
    ]);
    expect(hasWaecCredit(best, 'english')).toBe(true);
  });
});

describe('GPA and degree class', () => {
  it('uses the Nigerian 5-point class boundaries', () => {
    expect(degreeClassFor(5, 'bachelors')).toBe('first');
    expect(degreeClassFor(4.5, 'bachelors')).toBe('first');
    expect(degreeClassFor(4.49, 'bachelors')).toBe('second-upper');
    expect(degreeClassFor(3.5, 'bachelors')).toBe('second-upper');
    expect(degreeClassFor(3.49, 'bachelors')).toBe('second-lower');
    expect(degreeClassFor(2.4, 'bachelors')).toBe('second-lower');
    expect(degreeClassFor(2.39, 'bachelors')).toBe('third');
    expect(degreeClassFor(1.5, 'bachelors')).toBe('third');
    expect(degreeClassFor(1.49, 'bachelors')).toBe('pass');
    expect(degreeClassFor(1, 'bachelors')).toBe('pass');
    expect(degreeClassFor(0.99, 'bachelors')).toBeNull();
    expect(degreeClassFor(4.6, 'nd')).toBe('distinction');
    expect(degreeClassFor(3.6, 'hnd')).toBe('upper-credit');
    expect(degreeClassFor(2.5, 'nd')).toBe('lower-credit');
    expect(degreeClassFor(1.2, 'hnd')).toBe('pass');
  });

  it('turns mastery, attendance and mood into a sensible GPA', () => {
    const absent = meanGpa({ mastery: 0, requirement: 100, attendance: 0, mood: 40 });
    const lecturesOnly = meanGpa({ mastery: 75, requirement: 100, attendance: 1, mood: 60 });
    const scholar = meanGpa({ mastery: 125, requirement: 100, attendance: 1, mood: 85 });
    expect(absent).toBeLessThan(1);
    expect(lecturesOnly).toBeGreaterThan(2.9);
    expect(lecturesOnly).toBeLessThan(3.9);
    expect(scholar).toBeGreaterThan(4.6);
    for (let i = 0; i < 500; i++) {
      const gpa = semesterGpa(createRng(`range:${i}`), { mastery: i, requirement: 100, attendance: (i % 10) / 10, mood: i % 100 });
      expect(gpa).toBeGreaterThanOrEqual(0);
      expect(gpa).toBeLessThanOrEqual(5);
    }
  });

  it('averages semesters into a CGPA', () => {
    expect(cumulativeGpa([])).toBeNull();
    expect(cumulativeGpa([4, 3.5, 4.25])).toBe(3.92);
  });
});

describe('Admission aggregate', () => {
  it('adds UTME/8 and screening (each capped at 50) plus catchment', () => {
    expect(admissionAggregate(280, 45)).toBe(80);
    expect(admissionAggregate(400, 60)).toBe(100);
    expect(admissionAggregate(200, 30, 3)).toBe(58);
    expect(admissionAggregate(247, 38.5)).toBe(69.38);
  });

  it('only gives a supplementary-list chance just below the cut-off', () => {
    expect(supplementaryChance(0, 2, 5)).toBe(1);
    expect(supplementaryChance(3, 2, 5)).toBe(0);
    expect(supplementaryChance(1, 2, 5)).toBeGreaterThan(0);
    expect(supplementaryChance(1, 2, 100)).toBeLessThanOrEqual(0.6);
  });
});

describe('Strike extension', () => {
  const seed = 'eko-o-ni-baje';

  it('pushes graduation back by exactly the strike time inside the programme', () => {
    let strike = worldEventsForYear(seed, 2027).find((event) => event.kind === 'asuu-strike');
    for (let year = 2028; !strike && year < 2060; year++) strike = worldEventsForYear(seed, year).find((event) => event.kind === 'asuu-strike');
    expect(strike).toBeDefined();
    if (!strike) return;

    const startsAt = strike.startsAt - 30 * MINUTES_PER_DAY;
    const plannedEnd = startsAt + 4 * MINUTES_PER_YEAR;
    const strikeMinutes = worldEventMinutesBetween(seed, 'asuu-strike', startsAt, plannedEnd);
    expect(strikeMinutes).toBeGreaterThanOrEqual(strike.endsAt - strike.startsAt);
    expect(strikeAdjustedEnd(plannedEnd, strikeMinutes, 0)).toBe(plannedEnd + strikeMinutes);
    expect(strikeAdjustedEnd(plannedEnd, strikeMinutes, 10 * MINUTES_PER_DAY)).toBe(plannedEnd + strikeMinutes + 10 * MINUTES_PER_DAY);

    const dayStart = strike.startsAt - (strike.startsAt % MINUTES_PER_DAY) + MINUTES_PER_DAY;
    const strikeToday = worldEventMinutesBetween(seed, 'asuu-strike', dayStart, dayStart + MINUTES_PER_DAY);
    expect(dailyProgressMinutes(strikeToday, false)).toBe(0);
    expect(dailyProgressMinutes(0, false)).toBe(MINUTES_PER_DAY);
    expect(dailyProgressMinutes(0, true)).toBe(0);
  });
});

describe('Professional programmes', () => {
  it('keeps pass chances fair and IELTS bands in half steps', () => {
    expect(programmePassChance(0, 0, 30)).toBeGreaterThanOrEqual(0.15);
    expect(programmePassChance(100, 500, 30)).toBeLessThanOrEqual(0.97);
    expect(programmePassChance(40, 40, 30)).toBeGreaterThan(programmePassChance(40, 0, 30));
    for (let i = 0; i < 200; i++) {
      const band = ieltsBand(createRng(`ielts:${i}`), { intellect: i % 90, charisma: i % 60, prepHours: i % 30 });
      expect(band).toBeGreaterThanOrEqual(4);
      expect(band).toBeLessThanOrEqual(9);
      expect((band * 2) % 1).toBe(0);
    }
  });
});

describe('Fees and labels', () => {
  it('gives Lagos indigenes the LASU fee discount and charges hostel only out of town', () => {
    const lasu = findInstitution('lasu');
    const ui = findInstitution('ui');
    const education = findCourse('education');
    expect(lasu && ui && education).toBeTruthy();
    if (!lasu || !ui || !education) return;
    expect(annualTuition(lasu, education, 'lagos')).toBe(36_000);
    expect(annualTuition(lasu, education, 'anambra')).toBe(120_000);
    expect(sessionFees(ui, education, 'lagos')).toBe(250_000 + 90_000);
  });

  it('labels levels the Nigerian way', () => {
    expect(levelLabel(1)).toBe('100L');
    expect(levelLabel(4)).toBe('400L');
    expect(levelLabel(1, 'nd')).toBe('ND1');
    expect(levelLabel(2, 'hnd')).toBe('HND2');
  });
});

describe('Catalog integrity', () => {
  it('links institutions to campus venues and priced, known courses', () => {
    for (const institution of INSTITUTIONS as readonly InstitutionDefinition[]) {
      expect(findVenue(institution.venueId)?.type).toBe('campus');
      for (const offer of institution.courses) {
        const course = findCourse(offer.courseId);
        expect(course).toBeDefined();
        if (!course) continue;
        expect(institution.tuition[course.feeGroup]).toBeGreaterThan(0);
        expect(offer.cutoff).toBeGreaterThan(0);
        expect(offer.cutoff).toBeLessThanOrEqual(100);
      }
    }
    expect(new Set(COURSES.map((course) => course.id)).size).toBe(COURSES.length);
    expect(new Set(PROGRAMMES.map((programme) => programme.id)).size).toBe(PROGRAMMES.length);
    // The MDCN licence comes from the paid House Officer job (careers), never from an education programme.
    expect((PROGRAMMES as readonly ProgrammeDefinition[]).some((programme) => programme.grants === 'mdcn')).toBe(false);
    for (const course of COURSES) if ('next' in course) expect(PROGRAMMES.some((programme) => programme.id === course.next)).toBe(true);
  });
});
