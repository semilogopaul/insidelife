import { SKILL_KEYS, type SkillKey, type Skills } from '@insidelife/shared';
import type { CredentialsSnapshot, DegreeRecord } from '../../../common/ports/credentials.port.js';
import type { CandidateProfile } from './requirements.js';

/**
 * Test helpers for careers rules. The `-spec.ts` suffix keeps them out of the production build (the build config
 * excludes files ending in spec.ts) without vitest collecting them as a suite (it only runs `.spec.ts`).
 */

export function skills(overrides: Partial<Record<SkillKey, number>> = {}): Skills {
  const base = Object.fromEntries(SKILL_KEYS.map((key) => [key, 10])) as Record<SkillKey, number>;
  return { ...base, ...overrides };
}

export function degree(overrides: Partial<DegreeRecord> = {}): DegreeRecord {
  return {
    level: 'bachelors',
    courseId: 'economics',
    field: 'economics',
    institutionId: 'unilag',
    prestige: 80,
    grade: 'second-upper',
    cgpa: 4.0,
    completedAt: 0,
    ...overrides,
  };
}

export function credentials(overrides: Partial<CredentialsSnapshot> = {}): CredentialsSnapshot {
  return {
    highestLevel: 'ssce',
    waecCredits: 6,
    waecHasMathsEnglish: true,
    degrees: [],
    nysc: 'not-eligible',
    certifications: [],
    enrolled: false,
    ...overrides,
  };
}

export function graduate(overrides: Partial<CredentialsSnapshot> = {}, degreeOverrides: Partial<DegreeRecord> = {}): CredentialsSnapshot {
  return credentials({ highestLevel: 'bachelors', degrees: [degree(degreeOverrides)], nysc: 'completed', ...overrides });
}

export function profile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    age: 23,
    skills: skills(),
    connections: 5,
    credentials: credentials(),
    itemTags: new Set<string>(),
    experienceYears: new Map<string, number>(),
    ...overrides,
  };
}
