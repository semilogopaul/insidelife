import type { SimulationContext } from '../simulation/simulation-context.js';
import { EducationService } from './education.service.js';
import type { EnrolmentEntity } from './entities/enrolment.entity.js';
import type { ExamRegistrationEntity } from './entities/exam-registration.entity.js';
import type { NyscServiceEntity } from './entities/nysc-service.entity.js';
import type { ProgrammeEnrolmentEntity } from './entities/programme-enrolment.entity.js';
import type { CertificationsService } from './services/certifications.service.js';
import type { EducationStore } from './services/education-store.service.js';
import type { NyscService } from './services/nysc.service.js';
import type { WaecJambService } from './services/waec-jamb.service.js';

interface Fixture {
  readonly graduated?: readonly Partial<EnrolmentEntity>[];
  readonly current?: Partial<EnrolmentEntity> | null;
  readonly exams?: readonly Partial<ExamRegistrationEntity>[];
  readonly bestJamb?: number | null;
  readonly nysc?: Partial<NyscServiceEntity> | null;
  readonly programmes?: readonly Partial<ProgrammeEnrolmentEntity>[];
  readonly ieltsBand?: number;
}

/** Builds the port with in-memory collaborators (the real ones only add DB loading and memoisation). */
function servicePortFor(fixture: Fixture): EducationService {
  const store = {
    graduated: async () => fixture.graduated ?? [],
    currentEnrolment: async () => fixture.current ?? null,
    exams: async () => fixture.exams ?? [],
    nysc: async () => fixture.nysc ?? null,
    activeProgrammes: async () => fixture.programmes ?? [],
    certifications: async () => (fixture.ieltsBand === undefined ? [] : [{ code: 'ielts', score: fixture.ieltsBand }]),
  } as unknown as EducationStore;
  const exams = {
    standing: async () => ({ grades: [], credits: 6, hasMaths: true, hasEnglish: true }),
    bestJamb: async () => (fixture.bestJamb === undefined || fixture.bestJamb === null ? null : { score: fixture.bestJamb }),
  } as unknown as WaecJambService;
  const nysc = { status: async () => fixture.nysc?.status ?? 'not-eligible' } as unknown as NyscService;
  const certifications = { codes: async () => ['drivers-licence'] } as unknown as CertificationsService;
  return new EducationService(store, exams, nysc, certifications);
}

const ctx = {} as SimulationContext;

describe('EducationService (CREDENTIALS_PORT)', () => {
  it('reports a fresh school leaver with a pending JAMB', async () => {
    const credentials = await servicePortFor({ exams: [{ kind: 'jamb', status: 'registered' }] }).credentials(ctx);
    expect(credentials).toMatchObject({
      highestLevel: 'ssce',
      waecCredits: 6,
      waecHasMathsEnglish: true,
      degrees: [],
      enrolled: false,
      jambRegistered: true,
      jambScore: null,
      admitted: false,
      currentInstitutionId: null,
      currentProgramme: null,
      certifications: ['drivers-licence'],
      ieltsBand: null,
    });
  });

  it('exposes the stored IELTS band', async () => {
    expect((await servicePortFor({ ieltsBand: 7.5 }).credentials(ctx)).ieltsBand).toBe(7.5);
  });

  it('reports the campus and level of a current student', async () => {
    const credentials = await servicePortFor({
      exams: [{ kind: 'jamb', status: 'released', score: 247 }],
      bestJamb: 247,
      current: { status: 'active', institutionId: 'unilag', courseId: 'computer-science', level: 2 },
    }).credentials(ctx);
    expect(credentials).toMatchObject({
      enrolled: true,
      admitted: true,
      jambRegistered: false,
      jambScore: 247,
      currentInstitutionId: 'unilag',
      currentProgramme: '200L Computer Science',
    });
  });

  it('lists degrees with the highest level and labels corps members', async () => {
    const credentials = await servicePortFor({
      graduated: [
        { status: 'graduated', institutionId: 'yabatech', courseId: 'nd-accountancy', degreeClass: 'upper-credit', cgpa: 3.7, graduatedAt: 1_000 },
        { status: 'graduated', institutionId: 'unilag', courseId: 'accounting', degreeClass: 'second-upper', cgpa: 3.82, graduatedAt: 5_000 },
      ],
      nysc: { status: 'serving' },
    }).credentials(ctx);
    expect(credentials.highestLevel).toBe('bachelors');
    expect(credentials.degrees.map((degree) => [degree.level, degree.field, degree.grade, degree.prestige])).toEqual([
      ['nd', 'accounting', 'upper-credit', 60],
      ['bachelors', 'accounting', 'second-upper', 92],
    ]);
    expect(credentials.nysc).toBe('serving');
    expect(credentials.currentProgramme).toBe('NYSC corps member');
    expect(credentials.enrolled).toBe(false);
  });

  it('counts only weekday-class programmes as enrolment', async () => {
    const ielts = await servicePortFor({ programmes: [{ programmeId: 'ielts', status: 'active' }] }).credentials(ctx);
    expect(ielts.enrolled).toBe(false);
    expect(ielts.currentProgramme).toBe('IELTS Academic');
    const bootcamp = await servicePortFor({ programmes: [{ programmeId: 'tech-bootcamp', status: 'active' }] }).credentials(ctx);
    expect(bootcamp.enrolled).toBe(true);
  });
});
