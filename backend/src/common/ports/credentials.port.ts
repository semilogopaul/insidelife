import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/** Education levels in ascending order of seniority. */
export const EDUCATION_LEVELS = ['none', 'ssce', 'nd', 'hnd', 'bachelors', 'masters', 'phd'] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export type DegreeClass = 'first' | 'second-upper' | 'second-lower' | 'third' | 'pass' | 'distinction' | 'upper-credit' | 'lower-credit';

export interface DegreeRecord {
  readonly level: EducationLevel;
  readonly courseId: string;
  /** Course field, e.g. `medicine`, `law`, `computer-science`, `accounting`. */
  readonly field: string;
  readonly institutionId: string;
  /** 0-100 prestige of the institution. */
  readonly prestige: number;
  readonly grade: DegreeClass;
  readonly cgpa: number;
  readonly completedAt: number;
}

export interface CredentialsSnapshot {
  readonly highestLevel: EducationLevel;
  readonly waecCredits: number;
  readonly waecHasMathsEnglish: boolean;
  readonly degrees: readonly DegreeRecord[];
  readonly nysc: 'not-eligible' | 'pending' | 'serving' | 'completed' | 'exempt';
  /** Professional licences and certificates: `bar`, `mdcn`, `ican`, `nmcn`, `coren`, `cloud`, `pmp`, `ielts`, `drivers-licence`. */
  readonly certifications: readonly string[];
  /** Currently enrolled in a programme (affects job schedules). */
  readonly enrolled: boolean;
  /** JAMB: registered for an upcoming sitting, and the best UTME score so far (null if never sat). */
  readonly jambRegistered?: boolean;
  readonly jambScore?: number | null;
  /** Admission offer accepted / currently admitted somewhere. */
  readonly admitted?: boolean;
  /** Institution currently enrolled at (venue id of the campus) and a short programme label, e.g. "200L Computer Science". */
  readonly currentInstitutionId?: string | null;
  readonly currentProgramme?: string | null;
  /** Best IELTS overall band (0-9) for japa/visa checks, null if never sat. */
  readonly ieltsBand?: number | null;
}

/** Implemented by the education module. */
export interface CredentialsPort {
  credentials(ctx: SimulationContext): Promise<CredentialsSnapshot>;
  /** Grant a certification (e.g. a driving test passed, a bootcamp finished). */
  grantCertification(ctx: SimulationContext, certification: string): Promise<void>;
}

export const CREDENTIALS_PORT = Symbol('CREDENTIALS_PORT');
