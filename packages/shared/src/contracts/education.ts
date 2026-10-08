import type { GameMinute } from '../time/calendar.js';
import type {
  CourseCredential,
  DegreeClassId,
  ExamKind,
  InstitutionKind,
  StrikeUnion,
  WaecGrade,
  WaecSubjectId,
} from '../catalog/education.js';

/** Education ("School" app) API contracts. All amounts are naira after the world price index. */

// ----- Requests ----------------------------------------------------------------------------------------------------

export interface RegisterExamRequest {
  readonly kind: ExamKind;
  /** JAMB only: first-choice institution and course. */
  readonly institutionId?: string;
  readonly courseId?: string;
}

export interface ApplyForAdmissionRequest {
  readonly institutionId: string;
  readonly courseId: string;
}

// ----- WAEC & JAMB -------------------------------------------------------------------------------------------------

export interface WaecSubjectResultDto {
  readonly subjectId: WaecSubjectId;
  readonly label: string;
  readonly grade: WaecGrade;
  readonly credit: boolean;
}

export interface WaecSittingDto {
  readonly id: string;
  readonly kind: 'waec' | 'gce';
  /** 1 = school WAEC, 2+ = GCE resits. */
  readonly sitting: number;
  readonly releasedAt: GameMinute;
  readonly credits: number;
  readonly subjects: readonly WaecSubjectResultDto[];
}

export interface WaecSummaryDto {
  readonly sittings: readonly WaecSittingDto[];
  /** Best grade per subject across sittings. */
  readonly best: readonly WaecSubjectResultDto[];
  readonly credits: number;
  readonly hasMaths: boolean;
  readonly hasEnglish: boolean;
  /** Five credits including Maths and English (the university minimum). */
  readonly meetsUniversityMinimum: boolean;
}

export const EXAM_REGISTRATION_STATUSES = ['registered', 'sitting', 'written', 'released'] as const;
export type ExamRegistrationStatus = (typeof EXAM_REGISTRATION_STATUSES)[number];

export interface ExamRegistrationDto {
  readonly id: string;
  readonly kind: ExamKind;
  readonly status: ExamRegistrationStatus;
  /** CBT centre where the paper must be written. */
  readonly venueId: string;
  readonly venueName: string;
  readonly registeredAt: GameMinute;
  /** Earliest time the paper can be written (prep window). */
  readonly canSitFrom: GameMinute;
  readonly writtenAt: GameMinute | null;
  /** When the result is (or will be) released. */
  readonly resultAt: GameMinute | null;
  /** UTME score (0-400) once released. */
  readonly score: number | null;
  readonly prepHours: number;
  readonly fee: number;
  readonly firstChoice: { readonly institutionId: string; readonly institutionName: string; readonly courseId: string; readonly courseName: string } | null;
}

export interface JambStatusDto {
  /** "Register at a CBT centre", "Awaiting JAMB result", "JAMB 247". */
  readonly label: string;
  readonly current: ExamRegistrationDto | null;
  /** Best released UTME score that can be used for admission. */
  readonly score: number | null;
}

// ----- Admissions --------------------------------------------------------------------------------------------------

export const ADMISSION_STATUSES = ['screening', 'offered', 'rejected', 'accepted', 'declined', 'expired'] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

export interface AcceptanceQuoteDto {
  readonly acceptanceFee: number;
  readonly firstSessionFees: number;
  /** Parents pay the first session (birth-lottery perk). */
  readonly sponsoredByParents: boolean;
  /** What the player pays now. */
  readonly total: number;
}

export interface AdmissionApplicationDto {
  readonly id: string;
  readonly institutionId: string;
  readonly institutionName: string;
  readonly courseId: string;
  readonly courseName: string;
  readonly status: AdmissionStatus;
  readonly appliedAt: GameMinute;
  readonly decisionAt: GameMinute;
  /** UTME score used (null for HND direct entry). */
  readonly utmeScore: number | null;
  /** Revealed with the decision. */
  readonly screeningScore: number | null;
  readonly aggregate: number | null;
  readonly cutoff: number;
  readonly catchmentBonus: number;
  readonly supplementaryList: boolean;
  readonly acceptBy: GameMinute | null;
  readonly acceptance: AcceptanceQuoteDto | null;
}

// ----- Enrolment ---------------------------------------------------------------------------------------------------

export const ENROLMENT_STATUSES = ['admitted', 'active', 'suspended', 'graduated', 'withdrawn'] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

export interface SemesterResultDto {
  readonly session: number;
  readonly semester: number;
  readonly level: string;
  readonly gpa: number;
  /** 0-1. */
  readonly attendance: number;
  /** 0-1+ mastery against the course requirement. */
  readonly mastery: number;
}

export interface EnrolmentFeesDto {
  /** Outstanding fees for the current session (0 when paid). */
  readonly due: number;
  readonly dueAt: GameMinute | null;
  /** Suspension date if still unpaid. */
  readonly graceUntil: GameMinute | null;
  readonly paidSessions: number;
}

export interface EducationEnrolmentDto {
  readonly id: string;
  readonly institutionId: string;
  readonly institutionName: string;
  readonly courseId: string;
  /** "B.Sc Computer Science". */
  readonly title: string;
  readonly credential: CourseCredential;
  readonly status: EnrolmentStatus;
  /** "200L". */
  readonly level: string;
  readonly session: number;
  readonly semester: number;
  readonly totalSemesters: number;
  /** 0-100 through the whole programme. */
  readonly progressPercent: number;
  /** 0-100+ of this semester's mastery target. */
  readonly masteryPercent: number;
  /** 0-100 lecture attendance this semester. */
  readonly attendancePercent: number;
  readonly cgpa: number | null;
  readonly projectedClass: DegreeClassId | null;
  readonly semesterResults: readonly SemesterResultDto[];
  readonly startsAt: GameMinute;
  /** Includes time lost to strikes and suspension so far. */
  readonly expectedGraduationAt: GameMinute;
  readonly strikeDelayMinutes: number;
  readonly onStrike: boolean;
  readonly livesInHostel: boolean;
  readonly fees: EnrolmentFeesDto;
}

export interface EducationDegreeDto {
  readonly enrolmentId: string;
  readonly credential: CourseCredential;
  readonly field: string;
  readonly title: string;
  readonly institutionName: string;
  readonly degreeClass: DegreeClassId;
  readonly classLabel: string;
  readonly cgpa: number;
  readonly graduatedAt: GameMinute;
}

export interface StrikeBannerDto {
  readonly kind: 'asuu-strike' | 'asup-strike';
  readonly title: string;
  readonly description: string;
  readonly startedAt: GameMinute;
  readonly endsAt: GameMinute;
  /** True when it shuts your own campus. */
  readonly affectsYou: boolean;
}

// ----- NYSC, programmes, certifications ----------------------------------------------------------------------------

export type NyscStatus = 'not-eligible' | 'pending' | 'serving' | 'completed' | 'exempt';

export interface NyscServiceDto {
  readonly status: NyscStatus;
  readonly stateCode: string | null;
  readonly ppaVenueId: string | null;
  readonly ppaName: string | null;
  readonly startsAt: GameMinute | null;
  readonly endsAt: GameMinute | null;
  readonly monthlyAllowance: number;
  readonly ppaStipend: number;
}

export interface EducationCertificationDto {
  readonly code: string;
  readonly label: string;
  /** IELTS band, when scored. */
  readonly score: number | null;
  readonly grantedAt: GameMinute;
}

export const PROGRAMME_ENROLMENT_STATUSES = ['active', 'passed', 'failed', 'withdrawn'] as const;
export type ProgrammeEnrolmentStatus = (typeof PROGRAMME_ENROLMENT_STATUSES)[number];

export interface ProgrammeEnrolmentDto {
  readonly id: string;
  readonly programmeId: string;
  readonly name: string;
  readonly status: ProgrammeEnrolmentStatus;
  readonly startedAt: GameMinute;
  readonly endsAt: GameMinute;
  readonly prepHours: number;
  readonly progressPercent: number;
  /** IELTS band for scored exams. */
  readonly score: number | null;
}

// ----- Catalogue with eligibility ----------------------------------------------------------------------------------

export interface Eligibility {
  readonly eligible: boolean;
  /** Why not (first unmet requirement). */
  readonly reason: string | null;
}

export interface InstitutionCourseOptionDto extends Eligibility {
  readonly courseId: string;
  readonly title: string;
  readonly credential: CourseCredential;
  readonly years: number;
  readonly cutoff: number;
  /** Tuition + hostel for one session, after indigene discount. */
  readonly sessionFees: number;
}

export interface InstitutionOptionDto {
  readonly id: string;
  readonly venueId: string;
  readonly name: string;
  readonly shortName: string;
  readonly kind: InstitutionKind;
  readonly prestige: number;
  readonly strike: StrikeUnion;
  readonly minUtme: number;
  readonly acceptanceFee: number;
  readonly screeningFee: number;
  readonly hostelFee: number;
  readonly outOfTown: boolean;
  readonly courses: readonly InstitutionCourseOptionDto[];
}

export interface ProgrammeOptionDto extends Eligibility {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly blurb: string;
  readonly cost: number;
  readonly durationDays: number;
  readonly grants: string;
  readonly grantsLabel: string;
}

export interface EducationOverviewDto {
  readonly asOf: GameMinute;
  /** Same label as the snapshot summary ("200L Computer Science · UNILAG · CGPA 3.82"). */
  readonly headline: string;
  readonly waec: WaecSummaryDto;
  readonly jamb: JambStatusDto;
  readonly exams: readonly ExamRegistrationDto[];
  readonly applications: readonly AdmissionApplicationDto[];
  readonly enrolment: EducationEnrolmentDto | null;
  readonly degrees: readonly EducationDegreeDto[];
  readonly strike: StrikeBannerDto | null;
  readonly nysc: NyscServiceDto;
  readonly certifications: readonly EducationCertificationDto[];
  readonly programmes: readonly ProgrammeEnrolmentDto[];
  readonly catalogue: {
    readonly institutions: readonly InstitutionOptionDto[];
    readonly programmes: readonly ProgrammeOptionDto[];
  };
  readonly prices: { readonly jamb: number; readonly waecGce: number };
}
