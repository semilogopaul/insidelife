import { computePayslip, findJob, type JobDefinition } from '@insidelife/shared';
import { VOLATILITY_BOUNDS, attendancePayFactor, monthlyGross, payslipFor, volatilityMultiplier, type PayInput } from './payroll.js';

const job = (id: string): JobDefinition => {
  const definition = findJob(id);
  if (!definition) throw new RangeError(`missing job ${id}`);
  return definition;
};

const input = (definition: JobDefinition, overrides: Partial<PayInput> = {}): PayInput => ({
  job: definition,
  level: 0,
  monthIndex: 3,
  usdRate: 1_400,
  proration: 1,
  attendance: 1,
  payAdjustment: 1,
  volatilityDraw: 0,
  dettyDecember: false,
  ...overrides,
});

describe('payroll', () => {
  it('runs a graduate trainee salary through PAYE and pension exactly like computePayslip', () => {
    const slip = payslipFor(input(job('bank-graduate-trainee')));
    const expected = computePayslip({ gross: 280_000, pension: true, paye: true });
    expect(slip.gross).toBe(280_000);
    expect(slip.pensionEmployee).toBe(expected.pensionEmployee);
    expect(slip.pensionEmployee).toBe(22_400);
    expect(slip.pensionEmployer).toBe(28_000);
    expect(slip.tax).toBe(expected.tax);
    expect(slip.tax).toBeGreaterThan(0);
    expect(slip.net).toBe(280_000 - 22_400 - expected.tax);
  });

  it('keeps minimum-wage-level pay under the tax-free band', () => {
    const slip = payslipFor(input(job('call-centre-agent')));
    // ₦140k × 0.92 × 12 ≈ ₦1.55m taxable: only the slice above ₦800k is taxed at 15%.
    expect(slip.tax).toBe(Math.round(((140_000 - 11_200) * 12 - 800_000) * 0.15 / 12));
  });

  it('pays hustles cash in hand: no PAYE, no pension', () => {
    const slip = payslipFor(input(job('pos-attendant'), { volatilityDraw: 0.06 }));
    expect(slip.tax).toBe(0);
    expect(slip.pensionEmployee).toBe(0);
    expect(slip.pensionEmployer).toBe(0);
    expect(slip.net).toBe(slip.gross);
  });

  it('docks hustlers for every missed day but forgives a little absence in formal jobs', () => {
    const pos = job('pos-attendant');
    // A draw of σ/2 neutralises the tips volatility (multiplier exactly 1).
    expect(monthlyGross(input(pos, { attendance: 0.5, volatilityDraw: pos.payVolatility / 2 })).gross).toBe(Math.round(85_000 * 0.5));
    const bank = job('bank-graduate-trainee');
    expect(attendancePayFactor(bank, 0.9)).toBe(1);
    expect(monthlyGross(input(bank, { attendance: 0.45 })).gross).toBe(140_000);
  });

  it('pro-rates a partial first month', () => {
    expect(monthlyGross(input(job('teacher'), { proration: 0.25 })).gross).toBe(30_000);
  });

  it('converts remote USD pay at the payday rate and taxes it', () => {
    const remote = job('remote-software-engineer');
    const pay = monthlyGross(input(remote, { usdRate: 1_380 }));
    expect(pay.grossUsd).toBe(1_200);
    expect(pay.gross).toBe(1_656_000);
    const slip = payslipFor(input(remote, { usdRate: 1_380, level: 4 }));
    expect(slip.grossUsd).toBe(11_000);
    expect(slip.pensionEmployee).toBe(0);
    expect(slip.tax).toBeGreaterThan(slip.gross * 0.15);
  });

  it('bounds volatile show money and keeps its mean', () => {
    expect(volatilityMultiplier(0, 3)).toBe(1);
    expect(volatilityMultiplier(0.6, 10)).toBe(VOLATILITY_BOUNDS.max);
    expect(volatilityMultiplier(0.6, -10)).toBe(VOLATILITY_BOUNDS.min);
    expect(volatilityMultiplier(0.6, 0.3)).toBeCloseTo(1, 10);
  });

  it('boosts musicians in Detty December', () => {
    const musician = job('afrobeats-musician');
    expect(monthlyGross(input(musician, { dettyDecember: true, volatilityDraw: 0.3 })).gross).toBe(Math.round(40_000 * 1.8));
  });

  it('applies counter-offer raises', () => {
    expect(monthlyGross(input(job('software-engineer'), { payAdjustment: 1.15 })).gross).toBe(287_500);
  });
});
