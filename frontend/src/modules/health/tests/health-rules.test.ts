import { describe, expect, it } from 'vitest';
import { PREGNANCY_MINUTES, type HealthConditionDto, type TreatmentQuoteDto } from '@insidelife/shared';
import {
  activeIllnesses,
  driftLines,
  healthTone,
  percent,
  pregnancyProgress,
  recommendedQuote,
  sortQuotes,
} from '../services/health-rules';

const quote = (
  facility: TreatmentQuoteDto['facility'],
  youPay: number,
  successChance: number,
  available = true,
) => ({ facility, youPay, successChance, available });

describe('treatment quotes', () => {
  const quotes = [
    quote('hospital-private', 60_000, 0.95),
    quote('pharmacy', 3_000, 0.78),
    quote('hospital-public', 12_000, 0.88),
    quote('pharmacy', 0, 0, false),
  ];

  it('recommends the cheapest decent option for mild cases', () => {
    expect(recommendedQuote(quotes, 'mild')?.facility).toBe('pharmacy');
  });

  it('recommends the cheapest near-best option for moderate cases', () => {
    expect(recommendedQuote(quotes, 'moderate')?.facility).toBe('hospital-public');
  });

  it('recommends the best odds when it is serious', () => {
    expect(recommendedQuote(quotes, 'severe')?.facility).toBe('hospital-private');
  });

  it('returns null when nobody can treat it', () => {
    expect(recommendedQuote([quote('pharmacy', 0, 0, false)], 'critical')).toBeNull();
  });

  it('sorts available first, then pharmacy → public → private', () => {
    expect(
      sortQuotes([
        quote('hospital-private', 1, 1),
        quote('pharmacy', 1, 1, false),
        quote('hospital-public', 1, 1),
      ]).map((q) => `${q.facility}:${q.available}`),
    ).toEqual(['hospital-public:true', 'hospital-private:true', 'pharmacy:false']);
  });
});

describe('helpers', () => {
  it('tones, percents and pregnancy weeks', () => {
    expect(healthTone(88)).toBe('good');
    expect(healthTone(55)).toBe('warn');
    expect(healthTone(20)).toBe('bad');
    expect(percent(0.7)).toBe('70%');
    expect(pregnancyProgress(0, 0)).toEqual({ ratio: 0, week: 1 });
    expect(pregnancyProgress(0, PREGNANCY_MINUTES / 2).week).toBe(21);
    expect(pregnancyProgress(0, PREGNANCY_MINUTES * 2)).toEqual({ ratio: 1, week: 40 });
  });

  it('lists illnesses worst first, without pregnancy or recovered ones', () => {
    const condition = (
      id: string,
      severity: HealthConditionDto['severity'],
      extra: Partial<HealthConditionDto> = {},
    ) => ({ id, severity, kind: 'infection', status: 'active', ...extra }) as HealthConditionDto;
    const list = [
      condition('a', 'mild'),
      condition('b', 'critical'),
      condition('c', 'moderate', { status: 'recovered' }),
      condition('d', 'mild', { kind: 'pregnancy' }),
    ];
    expect(activeIllnesses(list).map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('explains yesterday’s drift by size, dropping zeros', () => {
    const lines = driftLines({
      lifestyle: -0.4,
      mood: 0.2,
      fitness: 0,
      age: 0,
      conditions: -1.5,
      deprivation: 0,
      recovery: 0.6,
      care: 0,
      total: -1.1,
    });
    expect(lines.map((line) => line.label)).toEqual([
      'Illness',
      'Natural recovery',
      'How you live (food, comfort)',
      'Mood',
    ]);
  });
});
