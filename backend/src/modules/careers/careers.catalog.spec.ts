import { JOBS, boosted, findVenue, jobPayRange } from '@insidelife/shared';

describe('careers catalog', () => {
  it('has about thirty jobs with unique ids', () => {
    expect(JOBS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(JOBS.map((job) => job.id)).size).toBe(JOBS.length);
  });

  it('puts every workplace at a real venue', () => {
    for (const job of JOBS) expect(findVenue(job.workplaceId), job.id).toBeDefined();
  });

  it('has ladders of 2-7 levels with pay that never goes down', () => {
    for (const job of JOBS) {
      expect(job.levels.length, job.id).toBeGreaterThanOrEqual(2);
      expect(job.levels.length, job.id).toBeLessThanOrEqual(7);
      job.levels.forEach((level, index) => {
        if (index > 0) expect(level.pay, `${job.id} ${level.title}`).toBeGreaterThanOrEqual(job.levels[index - 1]?.pay ?? 0);
      });
    }
  });

  it('pays formal jobs at least the ₦70k minimum wage', () => {
    for (const job of JOBS.filter((candidate) => candidate.perks.paye && candidate.currency === 'NGN')) {
      expect(jobPayRange(job).min, job.id).toBeGreaterThanOrEqual(70_000);
    }
  });

  it('calibrates the remote dollar ladder to $1,200 → $11,000 × the income multiplier', () => {
    const remote = JOBS.find((job) => job.currency === 'USD');
    expect(remote && jobPayRange(remote)).toEqual({ min: boosted(1_200, 1), max: boosted(11_000, 1) });
  });

  it('keeps schedules sane', () => {
    for (const job of JOBS) {
      expect(job.schedule.days.length, job.id).toBeGreaterThan(0);
      expect(job.schedule.hours, job.id).toBeLessThanOrEqual(12);
      expect(job.stress, job.id).toBeLessThanOrEqual(1);
    }
  });
});
