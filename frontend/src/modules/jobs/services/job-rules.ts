import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MONTHS,
  SKILL_LABELS,
  formatNairaCompact,
  startOfDay,
  toDateParts,
  type BusinessPnlDto,
  type GameMinute,
  type JobCurrency,
  type JobListingDto,
  type JobRequirementCheckDto,
  type JobScheduleDto,
  type PayslipDto,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';
import type { ReceiptLine } from '@/common/components';

// ----- Requirements → readable chips ------------------------------------------------------------------------------

/** The phone app that fixes a missing requirement. */
export type FixApp = 'school' | 'shop' | 'motors' | null;

export interface RequirementChip {
  readonly key: string;
  /** Short chip text ("Tech 30+ · you 12"). */
  readonly text: string;
  /** What to do about it ("Learn to code on a laptop"). */
  readonly hint: string;
  readonly app: FixApp;
}

export interface CandidateContext {
  readonly age: number;
  readonly skills: Skills;
}

const SKILL_HINTS: Partial<Record<SkillKey, string>> = {
  tech: 'Learn to code on a laptop',
  trade: 'Practise a trade at home or the market',
  intellect: 'Study — books pay',
  finance: 'Run a business, or study for ICAN',
  medicine: 'Medical school and housemanship',
  law: 'Law school and practice',
  engineering: 'An engineering degree and site work',
  charisma: 'Meet people, make content',
  creative: 'Make content',
  business: 'Run a small business',
  hustle: 'Hustle jobs build street smarts',
  fitness: 'Hit the gym or jog',
};

const POWER_TAGS = ['inverter', 'solar', 'generator', 'power'];

/** Turn a requirement the player is missing into a chip with a next step. */
export function describeRequirement(
  check: Pick<JobRequirementCheckDto, 'key' | 'label'>,
  context: CandidateContext,
): RequirementChip {
  const { key, label } = check;
  const bare = key.startsWith('gate:') ? key.slice(5) : key;
  if (bare === 'age')
    return { key, text: label, hint: `You’re ${context.age} — this one just needs time`, app: null };
  if (bare.startsWith('skill:')) {
    const skill = bare.slice(6) as SkillKey;
    const current = Math.floor(context.skills[skill] ?? 0);
    return {
      key,
      text: `${label} · you ${current}`,
      hint: SKILL_HINTS[skill] ?? `Build your ${SKILL_LABELS[skill]?.toLowerCase() ?? 'skills'}`,
      app: null,
    };
  }
  if (bare.startsWith('cert:')) {
    const licence = bare === 'cert:drivers-licence';
    return {
      key,
      text: label,
      hint: licence ? 'Take the driving test (Motors app)' : 'Get certified (School app)',
      app: licence ? 'motors' : 'school',
    };
  }
  if (bare.startsWith('item:')) {
    const tags = bare.slice(5).split('|');
    if (tags.includes('car')) return { key, text: label, hint: 'Buy a car (Motors app)', app: 'motors' };
    const power = tags.some((tag) => POWER_TAGS.includes(tag));
    return {
      key,
      text: label,
      hint: power ? 'Get power backup (Shop app)' : 'Buy it (Shop app)',
      app: 'shop',
    };
  }
  if (bare === 'education' || bare === 'grade' || bare === 'waec' || bare === 'nysc') {
    return { key, text: label, hint: 'Work on it in the School app', app: 'school' };
  }
  if (bare === 'connections') return { key, text: label, hint: 'Meet people — man know man', app: null };
  if (bare === 'experience')
    return { key, text: label, hint: 'Get experience in the right job first', app: null };
  return { key, text: label, hint: '', app: null };
}

/** Chips for every unmet requirement of a listing, in board order. */
export function missingChips(
  checks: readonly JobRequirementCheckDto[],
  context: CandidateContext,
): RequirementChip[] {
  return checks.filter((check) => !check.met).map((check) => describeRequirement(check, context));
}

// ----- Pay -------------------------------------------------------------------------------------------------------

const usd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "₦412k", "$2,500". */
export function formatPay(amount: number, currency: JobCurrency): string {
  return currency === 'USD' ? `$${usd.format(Math.round(amount))}` : formatNairaCompact(amount);
}

/** "₦20k – ₦5M a month". */
export function payRangeLabel(range: {
  readonly min: number;
  readonly max: number;
  readonly currency: JobCurrency;
}): string {
  if (range.min === range.max) return `${formatPay(range.min, range.currency)} a month`;
  return `${formatPay(range.min, range.currency)} – ${formatPay(range.max, range.currency)} a month`;
}

/** Gross → PAYE → pension → take-home, as receipt lines (employer pension shown, not counted). */
export function payslipLines(payslip: PayslipDto): { readonly lines: ReceiptLine[]; readonly net: number } {
  const notes: string[] = [];
  if (payslip.proration < 0.999) notes.push(`${Math.round(payslip.proration * 100)}% of the month employed`);
  if (payslip.attendance < 0.999) notes.push(`${Math.round(payslip.attendance * 100)}% attendance`);
  const lines: ReceiptLine[] = [
    { label: 'Gross pay', amount: payslip.gross, note: notes.length > 0 ? notes.join(' · ') : undefined },
    { label: 'PAYE tax', amount: -payslip.tax },
    { label: 'Pension (8%)', amount: -payslip.pensionEmployee, note: 'Into your locked RSA' },
  ];
  if (payslip.pensionEmployer > 0)
    lines.push({
      label: 'Employer pension (10%)',
      amount: payslip.pensionEmployer,
      muted: true,
      note: 'Paid on top, into your RSA',
    });
  return { lines, net: payslip.net };
}

// ----- Schedule ----------------------------------------------------------------------------------------------------

export interface Shift {
  readonly start: GameMinute;
  readonly end: GameMinute;
  readonly inProgress: boolean;
}

/** The current or next shift for a weekly schedule (night shifts that run past midnight included). */
export function nextShift(
  schedule: Pick<JobScheduleDto, 'days' | 'startHour' | 'hours'>,
  now: GameMinute,
): Shift | null {
  if (schedule.days.length === 0 || schedule.hours <= 0) return null;
  const today = startOfDay(now);
  for (let offset = -1; offset <= 7; offset++) {
    const day = today + offset * MINUTES_PER_DAY;
    if (!schedule.days.includes(toDateParts(day).weekday)) continue;
    const start = day + schedule.startHour * MINUTES_PER_HOUR;
    const end = start + schedule.hours * MINUTES_PER_HOUR;
    if (end > now) return { start, end, inProgress: start <= now };
  }
  return null;
}

// ----- Board filters -------------------------------------------------------------------------------------------------

export type BoardScope = 'eligible' | 'all';

export interface BoardFilter {
  readonly scope: BoardScope;
  /** `all` or an industry name. */
  readonly industry: string;
}

/** Distinct industries, alphabetical. */
export function industriesOf(jobs: readonly Pick<JobListingDto, 'industry'>[]): string[] {
  return [...new Set(jobs.map((job) => job.industry))].sort((a, b) => a.localeCompare(b));
}

/** Filter, then order: your job, then eligible by best odds, then the closest to reach (fewest gaps), richest first. */
export function filterJobs<
  T extends Pick<
    JobListingDto,
    'eligible' | 'industry' | 'estimatedChance' | 'entryPayNaira' | 'missing' | 'current'
  >,
>(jobs: readonly T[], filter: BoardFilter): T[] {
  return jobs
    .filter(
      (job) =>
        (filter.scope === 'all' || job.eligible || job.current) &&
        (filter.industry === 'all' || job.industry === filter.industry),
    )
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        Number(b.eligible) - Number(a.eligible) ||
        b.estimatedChance - a.estimatedChance ||
        a.missing.length - b.missing.length ||
        b.entryPayNaira - a.entryPayNaira,
    );
}

/** "62%" odds, never 0% for eligible jobs (rounds up to 1%). */
export function chanceLabel(chance: number): string {
  if (chance <= 0) return '0%';
  return `${Math.max(1, Math.round(chance * 100))}%`;
}

// ----- Business P&L ------------------------------------------------------------------------------------------------

export interface PnlBar {
  readonly monthIndex: number;
  readonly label: string;
  readonly profit: number;
  /** 0-1 bar length relative to the biggest absolute month. */
  readonly ratio: number;
}

/** Last `count` months of profit, scaled for a zero-baseline bar chart. */
export function pnlBars(
  history: readonly Pick<BusinessPnlDto, 'monthIndex' | 'profit'>[],
  count = 6,
): PnlBar[] {
  const recent = [...history].sort((a, b) => a.monthIndex - b.monthIndex).slice(-count);
  const scale = Math.max(1, ...recent.map((entry) => Math.abs(entry.profit)));
  return recent.map((entry) => ({
    monthIndex: entry.monthIndex,
    label: (MONTHS[((entry.monthIndex % 12) + 12) % 12] ?? '').slice(0, 3),
    profit: entry.profit,
    ratio: Math.abs(entry.profit) / scale,
  }));
}
