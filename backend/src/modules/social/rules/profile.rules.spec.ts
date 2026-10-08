import type { CredentialsSnapshot, DegreeRecord } from '../../../common/ports/credentials.port.js';
import type { EmploymentSnapshot } from '../../../common/ports/employment.port.js';
import type { FamilySnapshot, FamilyMember } from '../../../common/ports/family.port.js';
import { computeBadges, degreeSummary, friendlyLocationLabel, profileTitle, type ProfileFacts } from './profile.rules.js';

const credentials = (overrides: Partial<CredentialsSnapshot> = {}): CredentialsSnapshot => ({
  highestLevel: 'ssce',
  waecCredits: 6,
  waecHasMathsEnglish: true,
  degrees: [],
  nysc: 'not-eligible',
  certifications: [],
  enrolled: false,
  ...overrides,
});

const degree = (overrides: Partial<DegreeRecord> = {}): DegreeRecord => ({
  level: 'bachelors',
  courseId: 'computer-science',
  field: 'computer-science',
  institutionId: 'unilag',
  prestige: 80,
  grade: 'second-upper',
  cgpa: 4.1,
  completedAt: 0,
  ...overrides,
});

const job: EmploymentSnapshot = {
  jobId: 'software-engineer',
  title: 'Software Engineer',
  employer: 'Paystack',
  industry: 'tech',
  monthlyPayNaira: 900_000,
  yearsInRole: 1,
  performance: 0.8,
  workplaceId: 'yaba-hub',
};

const child = (name: string): FamilyMember => ({ id: name, name, relation: 'child', age: 3, alive: true, characterId: null });
const family = (overrides: Partial<FamilySnapshot> = {}): FamilySnapshot => ({ members: [], relationship: 'single', partner: null, children: [], ...overrides });

const facts = (overrides: Partial<ProfileFacts> = {}): ProfileFacts => ({
  job: null,
  credentials: credentials(),
  family: family(),
  campusName: null,
  selfMadeNetWorth: 0,
  generation: 1,
  friendCount: 0,
  partiesHosted: 0,
  ...overrides,
});

describe('profile titles', () => {
  it('prefers the job title with the employer', () => {
    expect(profileTitle(facts({ job }))).toBe('Software Engineer at Paystack');
  });

  it('falls back to NYSC, then student at the campus, then graduate, then hustling', () => {
    expect(profileTitle(facts({ credentials: credentials({ nysc: 'serving' }) }))).toBe('Corps member (NYSC)');
    expect(profileTitle(facts({ credentials: credentials({ enrolled: true }), campusName: 'University of Lagos' }))).toBe('Student at University of Lagos');
    expect(profileTitle(facts({ credentials: credentials({ degrees: [degree()] }) }))).toBe('Graduate · job hunting');
    expect(profileTitle(facts())).toBe('Hustling');
  });
});

describe('degree summary', () => {
  it('headlines the highest degree and keeps the best CGPA', () => {
    const summary = degreeSummary([degree({ grade: 'first', cgpa: 4.72 }), degree({ level: 'masters', grade: 'distinction', cgpa: 4.5 })]);
    expect(summary.label).toBe('M.Sc, Distinction · University of Lagos');
    expect(summary.bestCgpa).toBe(4.72);
  });

  it('is empty for non-graduates', () => {
    expect(degreeSummary([])).toEqual({ label: null, bestCgpa: null });
  });
});

describe('badges', () => {
  it('awards badges in headline priority order', () => {
    const badges = computeBadges(
      facts({
        selfMadeNetWorth: 150_000_000,
        credentials: credentials({ degrees: [degree({ grade: 'first' })], certifications: ['bar'] }),
        family: family({ relationship: 'married', children: [child('a'), child('b')] }),
        partiesHosted: 1,
        generation: 2,
        friendCount: 30,
      }),
    );
    expect(badges).toEqual(['self-made-100m', 'first-class', 'barrister', 'owambe-host', 'married', 'parent', 'heir', 'social-butterfly']);
  });

  it('a full house replaces parent', () => {
    expect(computeBadges(facts({ family: family({ children: ['a', 'b', 'c', 'd'].map(child) }) }))).toEqual(['full-house']);
  });
});

describe('friend-facing locations', () => {
  it('never leaks another player’s home id', () => {
    expect(friendlyLocationLabel('home:me', 'me')).toBe('Home');
    expect(friendlyLocationLabel('home:someone-else', 'me')).toBe('At a friend’s place');
    expect(friendlyLocationLabel('street:yaba', 'me')).toBe('Out and about');
    expect(friendlyLocationLabel('eko-hotel', 'me')).toBe('Eko Hotel & Suites');
  });
});
