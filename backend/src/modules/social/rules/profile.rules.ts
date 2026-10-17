import {
  HEADLINE_BADGE_COUNT,
  PROFILE_TITLES,
  SOCIAL_BADGE_IDS,
  SOCIAL_BADGES,
  findVenue,
  isAircraftLocation,
  isHomeLocation,
  isStreetLocation,
  statusTier,
  type SocialBadgeDto,
  type SocialBadgeId,
  type StatusTierDto,
} from '@insidelife/shared';
import { EDUCATION_LEVELS, type CredentialsSnapshot, type DegreeClass, type DegreeRecord, type EducationLevel } from '../../../common/ports/credentials.port.js';
import type { EmploymentSnapshot } from '../../../common/ports/employment.port.js';
import type { FamilySnapshot } from '../../../common/ports/family.port.js';

/** What the profile cache is built from (ports + character + social counts). */
export interface ProfileFacts {
  readonly job: EmploymentSnapshot | null;
  readonly credentials: CredentialsSnapshot;
  readonly family: FamilySnapshot;
  /** Campus the character is currently attending lectures at, if any. */
  readonly campusName: string | null;
  readonly selfMadeNetWorth: number;
  readonly generation: number;
  readonly friendCount: number;
  readonly partiesHosted: number;
}

const DEGREE_LEVEL_SHORT: Readonly<Partial<Record<EducationLevel, string>>> = {
  nd: 'ND',
  hnd: 'HND',
  bachelors: 'B.Sc',
  masters: 'M.Sc',
  phd: 'PhD',
};

const DEGREE_CLASS_LABELS: Readonly<Record<DegreeClass, string>> = {
  first: 'First Class',
  'second-upper': 'Second Class Upper',
  'second-lower': 'Second Class Lower',
  third: 'Third Class',
  pass: 'Pass',
  distinction: 'Distinction',
  'upper-credit': 'Upper Credit',
  'lower-credit': 'Lower Credit',
};

const TITLE_MAX = 96;

const levelRank = (degree: DegreeRecord): number => EDUCATION_LEVELS.indexOf(degree.level);

/** Job title first, then NYSC, then "Student at …", then graduate/hustling. */
export function profileTitle(facts: Pick<ProfileFacts, 'job' | 'credentials' | 'campusName'>): string {
  const { job, credentials } = facts;
  if (job) {
    const employer = job.employer.trim();
    const title = employer && !job.title.toLowerCase().includes(employer.toLowerCase()) ? `${job.title} at ${employer}` : job.title;
    return title.slice(0, TITLE_MAX);
  }
  if (credentials.nysc === 'serving') return PROFILE_TITLES.corper;
  if (credentials.enrolled) return facts.campusName ? `${PROFILE_TITLES.student} at ${facts.campusName}`.slice(0, TITLE_MAX) : PROFILE_TITLES.student;
  if (graduateDegrees(credentials.degrees).length > 0) return PROFILE_TITLES.graduate;
  return PROFILE_TITLES.hustling;
}

/** Completed tertiary degrees (ND and above). */
export function graduateDegrees(degrees: readonly DegreeRecord[]): DegreeRecord[] {
  return degrees.filter((degree) => DEGREE_LEVEL_SHORT[degree.level] !== undefined);
}

/** Headline degree (highest level, then best CGPA) and the best CGPA for the scholars board. */
export function degreeSummary(degrees: readonly DegreeRecord[]): { readonly label: string | null; readonly bestCgpa: number | null } {
  const graduated = graduateDegrees(degrees);
  if (graduated.length === 0) return { label: null, bestCgpa: null };
  const headline = graduated.toSorted((a, b) => levelRank(b) - levelRank(a) || b.cgpa - a.cgpa)[0] as DegreeRecord;
  const institution = findVenue(headline.institutionId)?.name;
  const label = `${DEGREE_LEVEL_SHORT[headline.level]}, ${DEGREE_CLASS_LABELS[headline.grade]}${institution ? ` · ${institution}` : ''}`;
  const bestCgpa = Math.max(...graduated.map((degree) => degree.cgpa));
  return { label: label.slice(0, 120), bestCgpa: Math.round(bestCgpa * 100) / 100 };
}

/** All earned badges, in headline priority order. */
export function computeBadges(facts: ProfileFacts): SocialBadgeId[] {
  const { credentials, family } = facts;
  const degrees = graduateDegrees(credentials.degrees);
  const children = family.children.length;
  const earned = new Set<SocialBadgeId>();
  if (facts.selfMadeNetWorth >= 1_000_000_000) earned.add('self-made-billionaire');
  else if (facts.selfMadeNetWorth >= 100_000_000) earned.add('self-made-100m');
  if (degrees.some((degree) => degree.grade === 'first' || degree.grade === 'distinction')) earned.add('first-class');
  else if (degrees.length > 0) earned.add('graduate');
  if (credentials.certifications.includes('bar')) earned.add('barrister');
  if (credentials.certifications.includes('mdcn')) earned.add('doctor');
  if (credentials.certifications.includes('ican')) earned.add('chartered');
  if (credentials.nysc === 'serving') earned.add('corper');
  if (facts.partiesHosted > 0) earned.add('owambe-host');
  if (family.relationship === 'married') earned.add('married');
  if (children >= 4) earned.add('full-house');
  else if (children > 0) earned.add('parent');
  if (facts.generation > 1) earned.add('heir');
  if (facts.friendCount >= 25) earned.add('social-butterfly');
  return SOCIAL_BADGE_IDS.filter((id) => earned.has(id));
}

export function headlineBadges(badges: readonly SocialBadgeId[], limit: number = HEADLINE_BADGE_COUNT): SocialBadgeDto[] {
  return badges.slice(0, limit).map((id) => ({ id, label: SOCIAL_BADGES[id].label, emoji: SOCIAL_BADGES[id].emoji }));
}

export function statusTierDto(status: number): StatusTierDto {
  const tier = statusTier(status);
  return { id: tier.id, label: tier.label };
}

/** Friend-facing location label. Never reveals someone else's home id. */
export function friendlyLocationLabel(locationId: string, ownerId: string): string {
  if (isHomeLocation(locationId)) return locationId === `home:${ownerId}` ? 'Home' : 'At a friend’s place';
  if (isStreetLocation(locationId)) return 'Out and about';
  if (isAircraftLocation(locationId)) return 'Aboard a private aircraft';
  return findVenue(locationId)?.name ?? 'Out and about';
}
