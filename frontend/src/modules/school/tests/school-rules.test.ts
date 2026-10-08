import { describe, expect, it } from 'vitest';
import type {
  AdmissionApplicationDto,
  EducationEnrolmentDto,
  EducationOverviewDto,
  ExamRegistrationDto,
} from '@insidelife/shared';
import {
  acceptanceLines,
  gradeBand,
  jambReadiness,
  jambVerdict,
  nearestVenue,
  schoolNextStep,
  stageStatuses,
} from '../services/school-rules';

const base = {
  asOf: 0,
  headline: 'SSCE · 7 credits',
  waec: {
    sittings: [],
    best: [],
    credits: 7,
    hasMaths: true,
    hasEnglish: true,
    meetsUniversityMinimum: true,
  },
  jamb: { label: 'Register at a CBT centre', current: null, score: null },
  exams: [],
  applications: [],
  enrolment: null,
  degrees: [],
  strike: null,
  nysc: {
    status: 'not-eligible',
    stateCode: null,
    ppaVenueId: null,
    ppaName: null,
    startsAt: null,
    endsAt: null,
    monthlyAllowance: 77_000,
    ppaStipend: 0,
  },
  certifications: [],
  programmes: [],
  catalogue: { institutions: [], programmes: [] },
  prices: { jamb: 7_100, waecGce: 29_500 },
} as unknown as EducationOverviewDto;

const exam = (patch: Partial<ExamRegistrationDto>): ExamRegistrationDto =>
  ({
    id: 'e1',
    kind: 'jamb',
    status: 'registered',
    venueId: 'cbt-yaba',
    venueName: 'Yaba CBT Centre',
    registeredAt: 100,
    canSitFrom: 1_000,
    writtenAt: null,
    resultAt: null,
    score: null,
    prepHours: 0,
    fee: 7_100,
    firstChoice: null,
    ...patch,
  }) as ExamRegistrationDto;

const application = (patch: Partial<AdmissionApplicationDto>): AdmissionApplicationDto =>
  ({
    id: 'a1',
    institutionId: 'unilag',
    institutionName: 'University of Lagos',
    courseId: 'law',
    courseName: 'LL.B Law',
    status: 'screening',
    appliedAt: 0,
    decisionAt: 500,
    utmeScore: 240,
    screeningScore: null,
    aggregate: null,
    cutoff: 78,
    catchmentBonus: 0,
    supplementaryList: false,
    acceptBy: null,
    acceptance: null,
    ...patch,
  }) as AdmissionApplicationDto;

const with_ = (patch: Partial<EducationOverviewDto>): EducationOverviewDto =>
  ({ ...base, ...patch }) as EducationOverviewDto;

describe('school next step', () => {
  it('starts with registering for JAMB', () => {
    expect(schoolNextStep(base, 0)).toEqual({ kind: 'register-jamb', lastScore: null });
  });

  it('sends you to fix WAEC first when below the university minimum', () => {
    const overview = with_({ waec: { ...base.waec, meetsUniversityMinimum: false, hasMaths: false } });
    expect(schoolNextStep(overview, 0).kind).toBe('resit-waec');
  });

  it('walks the JAMB states: prepare → sit → writing → result', () => {
    expect(schoolNextStep(with_({ exams: [exam({})] }), 500).kind).toBe('prepare-jamb');
    expect(schoolNextStep(with_({ exams: [exam({})] }), 1_000).kind).toBe('sit-jamb');
    expect(schoolNextStep(with_({ exams: [exam({ status: 'sitting' })] }), 1_100).kind).toBe('writing-jamb');
    expect(schoolNextStep(with_({ exams: [exam({ status: 'written', resultAt: 2_000 })] }), 1_300).kind).toBe(
      'await-jamb',
    );
  });

  it('moves to admissions with a usable score, and back to JAMB with a failing one', () => {
    const released = exam({ status: 'released', score: 241 });
    expect(
      schoolNextStep(
        with_({ exams: [released], jamb: { label: 'JAMB 241', current: released, score: 241 } }),
        3_000,
      ),
    ).toEqual({ kind: 'apply-admission', score: 241 });
    const failed = exam({ status: 'released', score: 92 });
    expect(
      schoolNextStep(
        with_({ exams: [failed], jamb: { label: 'JAMB 92', current: failed, score: 92 } }),
        3_000,
      ),
    ).toEqual({ kind: 'register-jamb', lastScore: 92 });
  });

  it('prioritises an admission offer, then fees once enrolled', () => {
    const offered = application({ status: 'offered' });
    const jamb = { label: 'JAMB 241', current: null, score: 241 };
    expect(schoolNextStep(with_({ jamb, applications: [application({}), offered] }), 0).kind).toBe(
      'accept-offer',
    );
    expect(schoolNextStep(with_({ jamb, applications: [application({})] }), 0).kind).toBe('await-admission');
    const enrolment = {
      status: 'active',
      fees: { due: 180_000, dueAt: 0, graceUntil: 100, paidSessions: 0 },
    } as unknown as EducationEnrolmentDto;
    expect(schoolNextStep(with_({ enrolment }), 0).kind).toBe('pay-fees');
    const paid = { ...enrolment, fees: { ...enrolment.fees, due: 0 } } as EducationEnrolmentDto;
    expect(schoolNextStep(with_({ enrolment: paid }), 0).kind).toBe('attend');
  });
});

describe('pipeline stages', () => {
  it('marks the road from WAEC to NYSC', () => {
    expect(stageStatuses(base)).toEqual({
      waec: 'done',
      jamb: 'current',
      admission: 'todo',
      campus: 'todo',
      nysc: 'todo',
    });
    expect(stageStatuses(with_({ jamb: { label: '', current: null, score: 200 } }))).toMatchObject({
      jamb: 'done',
      admission: 'current',
    });
    const degree = { enrolmentId: 'x' } as EducationOverviewDto['degrees'][number];
    expect(stageStatuses(with_({ degrees: [degree], nysc: { ...base.nysc, status: 'pending' } }))).toEqual({
      waec: 'done',
      jamb: 'done',
      admission: 'done',
      campus: 'done',
      nysc: 'current',
    });
  });
});

describe('pipeline with a WAEC resit', () => {
  it('keeps JAMB current when it was registered alongside a resit', () => {
    const overview = with_({ waec: { ...base.waec, meetsUniversityMinimum: false }, exams: [exam({})] });
    expect(stageStatuses(overview)).toMatchObject({ waec: 'current', jamb: 'current' });
    expect(stageStatuses(with_({ waec: { ...base.waec, meetsUniversityMinimum: false } })).jamb).toBe('todo');
  });
});

describe('acceptance fee breakdown', () => {
  it('adds up to what you pay now', () => {
    const quote = {
      acceptanceFee: 68_800,
      firstSessionFees: 176_900,
      sponsoredByParents: false,
      total: 245_700,
    };
    const { lines, total } = acceptanceLines(quote);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(total);
  });

  it('shows the parents covering the session', () => {
    const quote = {
      acceptanceFee: 68_800,
      firstSessionFees: 176_900,
      sponsoredByParents: true,
      total: 68_800,
    };
    const { lines, total } = acceptanceLines(quote);
    expect(lines).toHaveLength(3);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(total);
  });
});

describe('helpers', () => {
  it('grades, readiness and verdicts', () => {
    expect(gradeBand('A1')).toBe('distinction');
    expect(gradeBand('C6')).toBe('credit');
    expect(gradeBand('E8')).toBe('pass');
    expect(gradeBand('F9')).toBe('fail');
    expect(jambReadiness(0)).toBe(0);
    expect(jambReadiness(22)).toBeCloseTo(0.632, 3);
    expect(jambVerdict(150)).toBe('university');
    expect(jambVerdict(120)).toBe('polytechnic');
    expect(jambVerdict(99)).toBe('retake');
  });

  it('finds the nearest CBT centre', () => {
    const venues = [
      { id: 'cbt-ikeja', districtId: 'ikeja' },
      { id: 'cbt-yaba', districtId: 'yaba' },
    ] as const;
    expect(nearestVenue(venues, 'surulere')?.id).toBe('cbt-yaba');
    expect(nearestVenue(venues, 'ikorodu')?.id).toBe('cbt-ikeja');
    expect(nearestVenue(venues, null)?.id).toBe('cbt-ikeja');
  });
});
