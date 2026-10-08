import { findJob, type JobDefinition } from '@insidelife/shared';
import { MAX_HIRING_CHANCE, MIN_HIRING_CHANCE, academicScore, displayChance, hiringChance } from './hiring.js';
import { graduate, profile, skills } from './fixtures-spec.js';

const job = (id: string): JobDefinition => {
  const definition = findJob(id);
  if (!definition) throw new RangeError(`missing job ${id}`);
  return definition;
};

describe('hiring chance', () => {
  it('hires almost anybody for a hustle', () => {
    expect(hiringChance(job('pos-attendant'), profile())).toBeGreaterThan(0.8);
  });

  it('makes elite employers hard to crack', () => {
    const chance = hiringChance(job('oil-gas-engineer'), profile({ credentials: graduate({}, { field: 'engineering', grade: 'second-upper', cgpa: 3.6, prestige: 50 }) }));
    expect(chance).toBeLessThan(0.3);
  });

  it('rewards a first class from a top school', () => {
    const bank = job('bank-graduate-trainee');
    const average = hiringChance(bank, profile({ credentials: graduate({}, { cgpa: 2.6, prestige: 40, grade: 'second-lower' }) }));
    const stellar = hiringChance(bank, profile({ credentials: graduate({}, { cgpa: 4.7, prestige: 95, grade: 'first' }) }));
    expect(stellar).toBeGreaterThan(average + 0.1);
  });

  it('lets "man know man" carry civil-service applications', () => {
    const civil = job('civil-service');
    const nobody = hiringChance(civil, profile({ credentials: graduate(), connections: 5 }));
    const wellConnected = hiringChance(civil, profile({ credentials: graduate(), connections: 70 }));
    expect(wellConnected - nobody).toBeGreaterThan(0.3);
  });

  it('rewards skills above the bar for tech jobs', () => {
    const swe = job('software-engineer');
    expect(hiringChance(swe, profile({ skills: skills({ tech: 70 }) }))).toBeGreaterThan(hiringChance(swe, profile({ skills: skills({ tech: 31 }) })));
  });

  it('lets the interview card swing the odds within bounds', () => {
    const bank = job('bank-graduate-trainee');
    const base = profile({ credentials: graduate() });
    expect(hiringChance(bank, base, 0.12)).toBeCloseTo(hiringChance(bank, base) + 0.12, 5);
    expect(hiringChance(bank, base, 5)).toBeCloseTo(hiringChance(bank, base) + 0.25, 5);
  });

  it('never reaches certainty either way', () => {
    for (const definition of [job('pos-attendant'), job('oil-gas-engineer'), job('remote-software-engineer')]) {
      const chance = hiringChance(definition, profile({ connections: 100, skills: skills({ tech: 100 }) }), 1);
      expect(chance).toBeLessThanOrEqual(MAX_HIRING_CHANCE);
      expect(hiringChance(definition, profile(), -1)).toBeGreaterThanOrEqual(MIN_HIRING_CHANCE);
    }
  });

  it('scores academics only for jobs that ask for qualifications', () => {
    expect(academicScore(job('pos-attendant'), profile())).toBe(0.5);
    expect(academicScore(job('bank-graduate-trainee'), profile())).toBe(0);
  });

  it('rounds the displayed estimate to 5%', () => {
    expect(displayChance(0.437)).toBe(0.45);
    expect(displayChance(0.42)).toBe(0.4);
  });
});
