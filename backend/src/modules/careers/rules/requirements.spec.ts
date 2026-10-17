import { findJob, fieldMatches, type JobDefinition } from '@insidelife/shared';
import { allMet, jobRequirementChecks, levelGateChecks, missingLabels } from './requirements.js';
import { credentials, graduate, profile, skills } from './fixtures-spec.js';

const job = (id: string): JobDefinition => {
  const definition = findJob(id);
  if (!definition) throw new RangeError(`missing job ${id}`);
  return definition;
};

describe('job eligibility', () => {
  it('lets anybody start an informal hustle', () => {
    const checks = jobRequirementChecks(job('pos-attendant'), profile({ age: 17, credentials: credentials({ highestLevel: 'none', waecCredits: 0, waecHasMathsEnglish: false }) }));
    expect(allMet(checks)).toBe(true);
  });

  it('requires a 2:2 bachelor’s, NYSC, WAEC and the age window for the bank graduate scheme', () => {
    const bank = job('bank-graduate-trainee');
    expect(allMet(jobRequirementChecks(bank, profile({ credentials: graduate() })))).toBe(true);

    const noNysc = jobRequirementChecks(bank, profile({ credentials: graduate({ nysc: 'serving' }) }));
    expect(missingLabels(noNysc)).toContain('NYSC completed (or exempted)');

    const thirdClass = jobRequirementChecks(bank, profile({ credentials: graduate({}, { grade: 'third', cgpa: 1.8 }) }));
    expect(thirdClass.find((check) => check.key === 'grade')?.met).toBe(false);

    const tooOld = jobRequirementChecks(bank, profile({ age: 29, credentials: graduate() }));
    expect(tooOld.find((check) => check.key === 'age')?.met).toBe(false);

    expect(allMet(jobRequirementChecks(bank, profile({ credentials: credentials() })))).toBe(false);
  });

  it('accepts NYSC exemption', () => {
    expect(allMet(jobRequirementChecks(job('bank-graduate-trainee'), profile({ credentials: graduate({ nysc: 'exempt' }) })))).toBe(true);
  });

  it('needs a medicine degree for housemanship, but no MDCN licence yet', () => {
    const doctor = job('doctor-luth');
    expect(allMet(jobRequirementChecks(doctor, profile({ credentials: graduate({ nysc: 'pending' }, { field: 'medicine', courseId: 'medicine' }) })))).toBe(true);
    expect(allMet(jobRequirementChecks(doctor, profile({ credentials: graduate() })))).toBe(false);
  });

  it('matches degree fields by segment', () => {
    expect(fieldMatches('engineering', 'civil-engineering')).toBe(true);
    expect(fieldMatches('engineering', 'engineering')).toBe(true);
    expect(fieldMatches('law', 'lawn-tennis')).toBe(false);
    expect(allMet(jobRequirementChecks(job('civil-engineer'), profile({ credentials: graduate({}, { field: 'engineering' }) })))).toBe(true);
  });

  it('gates remote dollar work on a laptop, power and real tech skill', () => {
    const remote = job('remote-software-engineer');
    const skilled = skills({ tech: 55 });
    const noKit = jobRequirementChecks(remote, profile({ skills: skilled, credentials: graduate() }));
    expect(missingLabels(noKit)).toEqual(['A laptop', 'Steady power at home (inverter, solar or generator)']);
    const withInverter = jobRequirementChecks(remote, profile({ skills: skilled, credentials: graduate(), itemTags: new Set(['laptop', 'inverter']) }));
    expect(allMet(withInverter)).toBe(true);
    const withGenerator = jobRequirementChecks(remote, profile({ skills: skilled, credentials: graduate(), itemTags: new Set(['laptop', 'generator']) }));
    expect(allMet(withGenerator)).toBe(true);
    const unskilled = jobRequirementChecks(remote, profile({ skills: skills({ tech: 30 }), credentials: graduate(), itemTags: new Set(['laptop', 'solar']) }));
    expect(allMet(unskilled)).toBe(false);
  });

  it('asks for a degree at the well-paid remote levels, and the first level needs an HND or better to be hired', () => {
    const remote = job('remote-software-engineer');
    const kit = { skills: skills({ tech: 55 }), itemTags: new Set(['laptop', 'inverter']) };
    expect(missingLabels(jobRequirementChecks(remote, profile(kit)))).toEqual(['HND or higher']);
  });

  it('gates promotion into a ₦3m+ level on a degree', () => {
    const swe = job('software-engineer');
    const level = swe.levels.find((candidate) => candidate.education);
    expect(level).toBeDefined();
    expect(missingLabels(levelGateChecks(level!, profile()))).toContain('HND or higher');
    expect(allMet(levelGateChecks(level!, profile({ credentials: graduate() })).filter((check) => check.key === 'gate:education'))).toBe(true);
  });

  it('needs a car and a licence to drive for Bolt', () => {
    const bolt = job('bolt-driver');
    expect(allMet(jobRequirementChecks(bolt, profile({ itemTags: new Set(['car']) })))).toBe(false);
    expect(allMet(jobRequirementChecks(bolt, profile({ itemTags: new Set(['car']), credentials: credentials({ certifications: ['drivers-licence'] }) })))).toBe(true);
  });

  it('counts experience across history for private hospitals', () => {
    const privateDoctor = job('doctor-private');
    const licensed = graduate({ certifications: ['mdcn'] }, { field: 'medicine' });
    expect(allMet(jobRequirementChecks(privateDoctor, profile({ credentials: licensed })))).toBe(false);
    expect(allMet(jobRequirementChecks(privateDoctor, profile({ credentials: licensed, experienceYears: new Map([['doctor-luth', 1.2]]) })))).toBe(true);
  });

  it('gates senior levels on licences and connections', () => {
    const audit = job('audit-associate');
    const manager = audit.levels[3];
    expect(manager?.title).toBe('Manager');
    if (!manager) return;
    const noIcan = levelGateChecks(manager, profile({ skills: skills({ finance: 60 }) }));
    expect(missingLabels(noIcan)).toEqual(['ICAN chartered accountant']);

    const permSec = job('civil-service').levels.at(-1);
    if (!permSec) return;
    const unconnected = levelGateChecks(permSec, profile({ skills: skills({ charisma: 60 }), connections: 20 }));
    expect(allMet(unconnected)).toBe(false);
    expect(allMet(levelGateChecks(permSec, profile({ skills: skills({ charisma: 60 }), connections: 75 })))).toBe(true);
  });
});
