import { describe, expect, it } from 'vitest';
import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  fromDateParts,
  toDateParts,
  type PayslipDto,
  type Skills,
} from '@insidelife/shared';
import {
  chanceLabel,
  describeRequirement,
  filterJobs,
  formatPay,
  industriesOf,
  missingChips,
  nextShift,
  payRangeLabel,
  payslipLines,
  pnlBars,
} from '../services/job-rules';

const skills = {
  intellect: 30,
  tech: 12,
  finance: 0,
  medicine: 0,
  law: 0,
  engineering: 0,
  business: 0,
  creative: 0,
  charisma: 10,
  fitness: 0,
  cooking: 0,
  trade: 4,
  hustle: 9,
} as Skills;
const context = { age: 17, skills };

describe('requirement chips', () => {
  it('shows the current skill level and how to raise it', () => {
    const chip = describeRequirement({ key: 'skill:tech', label: 'Tech 30+' }, context);
    expect(chip.text).toBe('Tech 30+ · you 12');
    expect(chip.hint).toMatch(/code/i);
    expect(chip.app).toBeNull();
  });

  it('points age gaps at time, not an app', () => {
    expect(describeRequirement({ key: 'age', label: 'Age 18+' }, context)).toMatchObject({
      text: 'Age 18+',
      app: null,
      hint: expect.stringContaining('17'),
    });
  });

  it('routes licences to Motors, items to Shop/Motors and schooling to School', () => {
    expect(
      describeRequirement({ key: 'cert:drivers-licence', label: 'FRSC driver’s licence' }, context).app,
    ).toBe('motors');
    expect(describeRequirement({ key: 'cert:bar', label: 'Called to the Nigerian Bar' }, context).app).toBe(
      'school',
    );
    expect(describeRequirement({ key: 'item:car', label: 'Your own car' }, context).app).toBe('motors');
    expect(describeRequirement({ key: 'item:laptop', label: 'A laptop' }, context).app).toBe('shop');
    expect(
      describeRequirement({ key: 'item:inverter|solar|generator', label: 'Steady power' }, context).hint,
    ).toMatch(/power/i);
    expect(describeRequirement({ key: 'nysc', label: 'NYSC completed' }, context).app).toBe('school');
    expect(describeRequirement({ key: 'gate:skill:tech', label: 'Tech 50+' }, context).text).toBe(
      'Tech 50+ · you 12',
    );
  });

  it('only lists unmet requirements, in order', () => {
    const chips = missingChips(
      [
        { key: 'age', label: 'Age 18+', met: false },
        { key: 'education', label: 'OND or higher', met: true },
        { key: 'skill:trade', label: 'Handiwork 15+', met: false },
      ],
      context,
    );
    expect(chips.map((chip) => chip.text)).toEqual(['Age 18+', 'Handiwork 15+ · you 4']);
  });
});

describe('pay', () => {
  it('formats naira compactly and dollars in full', () => {
    expect(formatPay(412_000, 'NGN')).toBe('₦412k');
    expect(formatPay(2_500, 'USD')).toBe('$2,500');
    expect(payRangeLabel({ min: 20_000, max: 5_000_000, currency: 'NGN' })).toBe('₦20k – ₦5M a month');
  });

  it('builds a payslip whose deductions add up to take-home', () => {
    const payslip: PayslipDto = {
      monthIndex: 3,
      gross: 412_000,
      grossUsd: null,
      tax: 38_200,
      pensionEmployee: 32_960,
      pensionEmployer: 41_200,
      net: 340_840,
      attendance: 0.93,
      proration: 1,
    };
    const { lines, net } = payslipLines(payslip);
    const counted = lines.filter((line) => !line.muted).reduce((sum, line) => sum + line.amount, 0);
    expect(counted).toBe(net);
    expect(lines[0]?.note).toBe('93% attendance');
    expect(lines.at(-1)).toMatchObject({ muted: true, amount: 41_200 });
  });

  it('never shows 0% for an eligible long shot', () => {
    expect(chanceLabel(0.004)).toBe('1%');
    expect(chanceLabel(0.62)).toBe('62%');
    expect(chanceLabel(0)).toBe('0%');
  });
});

describe('next shift', () => {
  const schedule = { days: [0, 1, 2, 3, 4], startHour: 8, hours: 9 };
  const at = (day: number, hour: number) => fromDateParts({ year: 2027, month: 1, day, hour });

  it('finds the next weekday shift', () => {
    // 1 Jan 2027 is a Friday: Friday 06:00 → today 08:00.
    expect(nextShift(schedule, at(1, 6))).toEqual({ start: at(1, 8), end: at(1, 17), inProgress: false });
    // Friday 18:00 → Monday 4 Jan 08:00.
    const monday = nextShift(schedule, at(1, 18));
    expect(monday && toDateParts(monday.start)).toMatchObject({ weekday: 0, hour: 8, day: 4 });
  });

  it('reports a shift in progress, including night shifts past midnight', () => {
    expect(nextShift(schedule, at(1, 10))?.inProgress).toBe(true);
    const nights = { days: [4], startHour: 19, hours: 11 };
    const saturday3am = at(2, 3);
    const shift = nextShift(nights, saturday3am);
    expect(shift).toMatchObject({
      inProgress: true,
      start: at(1, 19),
      end: at(1, 19) + 11 * MINUTES_PER_HOUR,
    });
    expect(shift && shift.end - MINUTES_PER_DAY).toBeLessThan(saturday3am);
  });

  it('returns null without working days', () => {
    expect(nextShift({ days: [], startHour: 8, hours: 8 }, 0)).toBeNull();
  });
});

describe('board filters', () => {
  const job = (
    id: string,
    eligible: boolean,
    industry: string,
    estimatedChance: number,
    entryPayNaira: number,
    missing: string[] = [],
    current = false,
  ) => ({
    id,
    eligible,
    industry,
    estimatedChance,
    entryPayNaira,
    missing,
    current,
  });
  const jobs = [
    job('bank', false, 'Banking', 0, 300_000, ['NYSC', 'Degree']),
    job('pos', true, 'Agency banking', 0.9, 60_000),
    job('cashier', true, 'Retail', 0.75, 90_000),
    job('okada', false, 'Transport', 0, 120_000, ['Age 18+']),
    job('mine', false, 'Retail', 0, 50_000, ['x'], true),
  ];

  it('keeps eligible jobs (and your own) by default, best odds first', () => {
    expect(filterJobs(jobs, { scope: 'eligible', industry: 'all' }).map((entry) => entry.id)).toEqual([
      'mine',
      'pos',
      'cashier',
    ]);
  });

  it('shows the closest-to-reach ineligible jobs first under "all"', () => {
    expect(filterJobs(jobs, { scope: 'all', industry: 'all' }).map((entry) => entry.id)).toEqual([
      'mine',
      'pos',
      'cashier',
      'okada',
      'bank',
    ]);
  });

  it('filters by industry and lists industries alphabetically', () => {
    expect(filterJobs(jobs, { scope: 'all', industry: 'Retail' }).map((entry) => entry.id)).toEqual([
      'mine',
      'cashier',
    ]);
    expect(industriesOf(jobs)).toEqual(['Agency banking', 'Banking', 'Retail', 'Transport']);
  });
});

describe('P&L bars', () => {
  it('keeps the last six months in order and scales by the biggest swing', () => {
    const history = [7, 2, 3, 4, 5, 6, 1].map((monthIndex) => ({
      monthIndex,
      profit: monthIndex === 4 ? -200_000 : 100_000,
    }));
    const bars = pnlBars(history);
    expect(bars.map((bar) => bar.monthIndex)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(bars.find((bar) => bar.monthIndex === 4)?.ratio).toBe(1);
    expect(bars[0]?.ratio).toBe(0.5);
    expect(bars[0]?.label).toBe('Mar');
  });
});
