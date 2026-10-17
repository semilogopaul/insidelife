import {
  CAREER_DEGREE_CLASS_LABELS,
  CAREER_DEGREE_CLASS_RANK,
  CAREER_EDUCATION_LABELS,
  SKILL_LABELS,
  educationRank,
  fieldMatches,
  jobCertificationLabel,
  type JobDefinition,
  type JobLevelDefinition,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';
import type { CredentialsSnapshot, DegreeRecord } from '../../../common/ports/credentials.port.js';

/** Everything requirement checks look at, gathered once per request. */
export interface CandidateProfile {
  readonly age: number;
  readonly skills: Skills;
  /** "Man know man", 0-100. */
  readonly connections: number;
  readonly credentials: CredentialsSnapshot;
  /** Item tags owned (only the ones jobs care about). */
  readonly itemTags: ReadonlySet<string>;
  /** Years served per job id (history plus the current job). */
  readonly experienceYears: ReadonlyMap<string, number>;
}

export interface RequirementCheck {
  readonly key: string;
  readonly label: string;
  readonly met: boolean;
}

const titleCase = (value: string): string => value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function hasNysc(credentials: CredentialsSnapshot): boolean {
  return credentials.nysc === 'completed' || credentials.nysc === 'exempt';
}

/** Degrees that satisfy the job's education level and field (if any). */
export function qualifyingDegrees(job: JobDefinition, credentials: CredentialsSnapshot): readonly DegreeRecord[] {
  const { education, fields } = job.requirements;
  const minRank = education ? educationRank(education) : 0;
  return credentials.degrees.filter((degree) => {
    if (educationRank(degree.level) < minRank) return false;
    if (!fields || fields.length === 0) return true;
    return fields.some((field) => fieldMatches(field, degree.field));
  });
}

function bestGradeRank(degrees: readonly DegreeRecord[]): number {
  return degrees.reduce((best, degree) => Math.max(best, CAREER_DEGREE_CLASS_RANK[degree.grade] ?? 0), 0);
}

function skillChecks(prefix: string, skills: Partial<Record<SkillKey, number>> | undefined, profile: CandidateProfile): RequirementCheck[] {
  return (Object.entries(skills ?? {}) as Array<[SkillKey, number]>).map(([skill, minimum]) => ({
    key: `${prefix}skill:${skill}`,
    label: `${SKILL_LABELS[skill]} ${minimum}+`,
    met: profile.skills[skill] >= minimum,
  }));
}

function certificationChecks(prefix: string, certifications: readonly string[] | undefined, profile: CandidateProfile): RequirementCheck[] {
  return (certifications ?? []).map((certification) => ({
    key: `${prefix}cert:${certification}`,
    label: jobCertificationLabel(certification),
    met: profile.credentials.certifications.includes(certification),
  }));
}

/** Every entry requirement of a job, met or not, in the order the job board shows them. */
export function jobRequirementChecks(job: JobDefinition, profile: CandidateProfile): RequirementCheck[] {
  const r = job.requirements;
  const checks: RequirementCheck[] = [];

  if (r.minAge !== undefined || r.maxAge !== undefined) {
    const label =
      r.minAge !== undefined && r.maxAge !== undefined
        ? `Age ${r.minAge}–${r.maxAge}`
        : r.maxAge !== undefined
          ? `Not older than ${r.maxAge}`
          : `Age ${r.minAge}+`;
    const met = (r.minAge === undefined || profile.age >= r.minAge) && (r.maxAge === undefined || profile.age <= r.maxAge);
    checks.push({ key: 'age', label, met });
  }

  if (r.education && r.education !== 'none') {
    const credentials = profile.credentials;
    if (r.fields && r.fields.length > 0) {
      const fieldLabel = r.fields.map(titleCase).join(' / ');
      checks.push({
        key: 'education',
        label: `${CAREER_EDUCATION_LABELS[r.education]} in ${fieldLabel}`,
        met: qualifyingDegrees(job, credentials).length > 0,
      });
    } else if (r.education === 'ssce') {
      checks.push({ key: 'education', label: CAREER_EDUCATION_LABELS.ssce, met: educationRank(credentials.highestLevel) >= educationRank('ssce') });
    } else {
      checks.push({
        key: 'education',
        label: `${CAREER_EDUCATION_LABELS[r.education]} or higher`,
        met:
          qualifyingDegrees(job, credentials).length > 0 ||
          educationRank(credentials.highestLevel) >= educationRank(r.education),
      });
    }
  }

  if (r.minGrade) {
    checks.push({
      key: 'grade',
      label: `${CAREER_DEGREE_CLASS_LABELS[r.minGrade]} or better`,
      met: bestGradeRank(qualifyingDegrees(job, profile.credentials)) >= CAREER_DEGREE_CLASS_RANK[r.minGrade],
    });
  }

  if (r.waecMathsEnglish) {
    checks.push({
      key: 'waec',
      label: '5 WAEC credits incl. Maths & English',
      met: profile.credentials.waecHasMathsEnglish && profile.credentials.waecCredits >= 5,
    });
  }

  if (r.nysc) checks.push({ key: 'nysc', label: 'NYSC completed (or exempted)', met: hasNysc(profile.credentials) });

  checks.push(...certificationChecks('', r.certifications, profile));

  for (const group of r.items ?? []) {
    checks.push({ key: `item:${group.anyOf.join('|')}`, label: group.label, met: group.anyOf.some((tag) => profile.itemTags.has(tag)) });
  }

  checks.push(...skillChecks('', r.skills, profile));

  if (r.experience) {
    const years = r.experience.jobIds.reduce((sum, jobId) => sum + (profile.experienceYears.get(jobId) ?? 0), 0);
    checks.push({ key: 'experience', label: r.experience.label, met: years >= r.experience.years });
  }

  return checks;
}

/** Gates for being promoted into `level` (skills, licences, NYSC, connections). */
export function levelGateChecks(level: JobLevelDefinition, profile: CandidateProfile): RequirementCheck[] {
  const checks: RequirementCheck[] = [
    ...skillChecks('gate:', level.skills, profile),
    ...certificationChecks('gate:', level.certifications, profile),
  ];
  if (level.education && level.education !== 'none') {
    checks.push({
      key: 'gate:education',
      label: `${CAREER_EDUCATION_LABELS[level.education]} or higher`,
      met: educationRank(profile.credentials.highestLevel) >= educationRank(level.education),
    });
  }
  if (level.nysc) checks.push({ key: 'gate:nysc', label: 'NYSC completed (or exempted)', met: hasNysc(profile.credentials) });
  if (level.minConnections !== undefined) {
    checks.push({
      key: 'gate:connections',
      label: `Connections ${level.minConnections}+ (man know man)`,
      met: profile.connections >= level.minConnections,
    });
  }
  return checks;
}

/** Human labels for a level's gates (job detail ladder). */
export function levelGateLabels(level: JobLevelDefinition): string[] {
  const labels = (Object.entries(level.skills ?? {}) as Array<[SkillKey, number]>).map(([skill, minimum]) => `${SKILL_LABELS[skill]} ${minimum}+`);
  for (const certification of level.certifications ?? []) labels.push(jobCertificationLabel(certification));
  if (level.education && level.education !== 'none') labels.push(`${CAREER_EDUCATION_LABELS[level.education]} or higher`);
  if (level.nysc) labels.push('NYSC completed');
  if (level.minConnections !== undefined) labels.push(`Connections ${level.minConnections}+`);
  if (level.breakout) labels.push('A breakout moment (luck + talent)');
  return labels;
}

export function allMet(checks: readonly RequirementCheck[]): boolean {
  return checks.every((check) => check.met);
}

export function missingLabels(checks: readonly RequirementCheck[]): string[] {
  return checks.filter((check) => !check.met).map((check) => check.label);
}

/** Item tags any job asks for (so the profile only probes the inventory for these). */
export function jobItemTags(jobs: readonly JobDefinition[]): readonly string[] {
  const tags = new Set<string>();
  for (const job of jobs) for (const group of job.requirements.items ?? []) for (const tag of group.anyOf) tags.add(tag);
  return [...tags];
}
