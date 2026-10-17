import type { GameMinute } from '../time/calendar.js';
import type { CityId, DistrictId } from '../catalog/geography.js';
import type { JobCurrency, JobPerks, JobSector, WorkMode } from '../catalog/careers.js';

/**
 * Careers API contracts — owned by the careers domain.
 *
 * GET    /v1/jobs                          → JobBoardDto
 * GET    /v1/jobs/:id                      → JobDetailDto
 * POST   /v1/jobs/:id/applications         → JobApplicationDto
 * GET    /v1/employment                    → EmploymentViewDto
 * POST   /v1/employment/promotion-requests → PromotionResultDto
 * POST   /v1/employment/leave              → EmploymentViewDto   (body: RequestLeaveRequest)
 * DELETE /v1/employment                    → ResignationResultDto
 */

export interface JobWorkplaceDto {
  readonly venueId: string;
  readonly name: string;
  readonly districtId: DistrictId;
  readonly mode: WorkMode;
  /** "Marina Business District", "Remote — from home", "On the road (CMS Bus Terminal)". */
  readonly label: string;
}

export interface JobScheduleDto {
  /** 0 = Monday … 6 = Sunday. */
  readonly days: readonly number[];
  readonly startHour: number;
  readonly hours: number;
  readonly weeklyHours: number;
  /** "Mon–Fri · 08:00–17:00". */
  readonly label: string;
}

export interface JobRequirementCheckDto {
  readonly key: string;
  readonly label: string;
  readonly met: boolean;
}

export interface MoneyRangeDto {
  readonly min: number;
  readonly max: number;
  readonly currency: JobCurrency;
}

/** `declined`: you got the offer but it paid less than your current job. */
export const JOB_APPLICATION_STATUSES = ['pending', 'interview', 'accepted', 'rejected', 'declined'] as const;
export type JobApplicationStatus = (typeof JOB_APPLICATION_STATUSES)[number];

export interface JobApplicationDto {
  readonly id: string;
  readonly jobId: string;
  readonly jobTitle: string;
  readonly employer: string;
  readonly status: JobApplicationStatus;
  readonly appliedAt: GameMinute;
  /** When the employer will reply (end of that game day at the latest). */
  readonly decisionExpectedBy: GameMinute;
  readonly decidedAt: GameMinute | null;
  /** An interview was scheduled (watch your life-event cards). */
  readonly interview: boolean;
  readonly message: string | null;
}

export interface JobListingDto {
  readonly id: string;
  readonly title: string;
  readonly entryTitle: string;
  readonly employer: string;
  readonly industry: string;
  readonly sector: JobSector;
  readonly emoji: string;
  readonly blurb: string;
  readonly workplace: JobWorkplaceDto;
  readonly schedule: JobScheduleDto;
  readonly currency: JobCurrency;
  /** Entry pay to top-of-ladder pay, in the job's currency. */
  readonly payRange: MoneyRangeDto;
  /** Entry pay in naira at today's rate (USD jobs converted). */
  readonly entryPayNaira: number;
  readonly perks: JobPerks;
  /** 0-1 */
  readonly stress: number;
  readonly levels: number;
  readonly eligible: boolean;
  readonly requirements: readonly JobRequirementCheckDto[];
  /** Labels of the requirements you don't meet yet. */
  readonly missing: readonly string[];
  /** Rough odds of an offer if you apply now (0 when ineligible). */
  readonly estimatedChance: number;
  /** Your open application for this job, if any. */
  readonly application: JobApplicationDto | null;
  /** This is your current job. */
  readonly current: boolean;
}

export interface JobLevelDto {
  readonly index: number;
  readonly title: string;
  readonly pay: number;
  readonly currency: JobCurrency;
  readonly minYears: number;
  /** Gates for promotion into this level (skills, licences, connections). */
  readonly gates: readonly string[];
  readonly breakout: boolean;
  readonly status: number;
}

export interface JobDetailDto extends JobListingDto {
  readonly ladder: readonly JobLevelDto[];
}

export interface JobBoardDto {
  /** The city whose board this is (remote jobs are on both). */
  readonly cityId: CityId;
  readonly jobs: readonly JobListingDto[];
  readonly applications: readonly JobApplicationDto[];
  readonly currentJobId: string | null;
  /** Open applications allowed at once. */
  readonly maxOpenApplications: number;
}

export interface PayslipDto {
  /** Month the payslip covers (whole months since the calendar origin). */
  readonly monthIndex: number;
  readonly gross: number;
  /** Gross in USD for dollar jobs. */
  readonly grossUsd: number | null;
  readonly tax: number;
  readonly pensionEmployee: number;
  readonly pensionEmployer: number;
  readonly net: number;
  /** 0-1 share of scheduled work actually done. */
  readonly attendance: number;
  /** 0-1 share of the month employed. */
  readonly proration: number;
}

export interface AttendanceDto {
  readonly scheduledMinutes: number;
  readonly workedMinutes: number;
  readonly absentMinutes: number;
  readonly lateMinutes: number;
  /** 0-1 */
  readonly ratio: number;
  /** Query letters received (one more strike after a warning and you're out). */
  readonly warnings: number;
  readonly strikes: number;
}

export interface PromotionOutlookDto {
  readonly nextTitle: string | null;
  readonly nextPay: number | null;
  /** Game minute from which time-in-level is satisfied. */
  readonly eligibleFrom: GameMinute | null;
  readonly gates: readonly JobRequirementCheckDto[];
  /** Everything is in place: ask for the promotion. */
  readonly ready: boolean;
  /** Only a breakout moment gets you to the next level. */
  readonly breakout: boolean;
  readonly blockedReason: string | null;
  /** Rough odds if you ask now. */
  readonly estimatedChance: number;
}

export interface LeaveDto {
  readonly entitlementDays: number;
  readonly usedDays: number;
  readonly remainingDays: number;
  readonly onLeave: boolean;
  readonly from: GameMinute | null;
  readonly until: GameMinute | null;
}

export interface EmploymentDto {
  readonly id: string;
  readonly jobId: string;
  readonly title: string;
  readonly employer: string;
  readonly industry: string;
  readonly emoji: string;
  readonly level: number;
  readonly levels: number;
  readonly workplace: JobWorkplaceDto;
  readonly schedule: JobScheduleDto;
  readonly currency: JobCurrency;
  /** Gross monthly pay in the job's currency. */
  readonly monthlyPay: number;
  /** Gross monthly pay in naira at today's rate. */
  readonly monthlyPayNaira: number;
  readonly perks: JobPerks;
  readonly stress: number;
  readonly startedAt: GameMinute;
  readonly levelStartedAt: GameMinute;
  readonly yearsInRole: number;
  readonly yearsInLevel: number;
  /** 0-1 rolling performance (attendance × mood × skill fit). */
  readonly performance: number;
  readonly attendance: AttendanceDto;
  /** What this month's payslip looks like if attendance holds. */
  readonly payslipPreview: PayslipDto;
  readonly lastPayslip: PayslipDto | null;
  readonly promotion: PromotionOutlookDto;
  readonly leave: LeaveDto;
  /** Government "salary delay": pay is held until this time. */
  readonly salaryHeldUntil: GameMinute | null;
}

export const EMPLOYMENT_END_REASONS = ['resigned', 'fired', 'moved-on', 'japa', 'deceased'] as const;
export type EmploymentEndReason = (typeof EMPLOYMENT_END_REASONS)[number];

export interface EmploymentHistoryDto {
  readonly id: string;
  readonly jobId: string;
  readonly title: string;
  readonly employer: string;
  readonly startedAt: GameMinute;
  readonly endedAt: GameMinute;
  readonly years: number;
  readonly reason: EmploymentEndReason;
  readonly totalEarned: number;
}

export interface EmploymentViewDto {
  readonly employment: EmploymentDto | null;
  readonly history: readonly EmploymentHistoryDto[];
  readonly applications: readonly JobApplicationDto[];
}

export interface PromotionResultDto {
  readonly promoted: boolean;
  readonly title: string;
  readonly message: string;
  readonly employment: EmploymentDto;
}

export interface RequestLeaveRequest {
  /** Whole game days, starting tomorrow. */
  readonly days: number;
}

export interface ResignationResultDto {
  readonly message: string;
  /** Final (pro-rated) pay for the month, if any was due. */
  readonly finalPay: PayslipDto | null;
  readonly view: EmploymentViewDto;
}
