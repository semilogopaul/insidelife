import { Injectable } from '@nestjs/common';
import { findCourse, findInstitution, findProgramme, levelLabel } from '@insidelife/shared';
import {
  EDUCATION_LEVELS,
  type CredentialsPort,
  type CredentialsSnapshot,
  type DegreeRecord,
  type EducationLevel,
} from '../../common/ports/credentials.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { CertificationsService } from './services/certifications.service.js';
import { EducationStore } from './services/education-store.service.js';
import { NyscService } from './services/nysc.service.js';
import { WaecJambService } from './services/waec-jamb.service.js';

/**
 * Education's public face for other domains (`CREDENTIALS_PORT`): what the character has achieved — WAEC, JAMB,
 * degrees, NYSC, licences — and a way to grant certifications earned elsewhere (e.g. the FRSC driver's licence).
 */
@Injectable()
export class EducationService implements CredentialsPort {
  constructor(
    private readonly store: EducationStore,
    private readonly exams: WaecJambService,
    private readonly nysc: NyscService,
    private readonly certifications: CertificationsService,
  ) {}

  async credentials(ctx: SimulationContext): Promise<CredentialsSnapshot> {
    // Sequential on purpose: loads are memoised on the context and must not race each other.
    const waec = await this.exams.standing(ctx);
    const graduated = await this.store.graduated(ctx);
    const current = await this.store.currentEnrolment(ctx);
    const nysc = await this.nysc.status(ctx);
    const certifications = await this.certifications.codes(ctx);
    const ieltsBand = (await this.store.certifications(ctx)).find((certification) => certification.code === 'ielts')?.score ?? null;
    // Weekday classes (bootcamps) occupy the schedule like lectures do.
    const programmes = await this.store.activeProgrammes(ctx);
    const exams = await this.store.exams(ctx);
    const bestJamb = await this.exams.bestJamb(ctx);
    // Registered and not yet holding the result (still to write, or written and awaiting release).
    const jambRegistered = exams.some((exam) => exam.kind === 'jamb' && exam.status !== 'released');

    const degrees: DegreeRecord[] = [];
    let highestLevel: EducationLevel = 'ssce';
    for (const enrolment of graduated) {
      const course = findCourse(enrolment.courseId);
      if (!course || !enrolment.degreeClass || enrolment.graduatedAt === null) continue;
      degrees.push({
        level: course.credential,
        courseId: course.id,
        field: course.field,
        institutionId: enrolment.institutionId,
        prestige: findInstitution(enrolment.institutionId)?.prestige ?? 0,
        grade: enrolment.degreeClass,
        cgpa: enrolment.cgpa ?? 0,
        completedAt: enrolment.graduatedAt,
      });
      if (EDUCATION_LEVELS.indexOf(course.credential) > EDUCATION_LEVELS.indexOf(highestLevel)) highestLevel = course.credential;
    }

    return {
      highestLevel,
      waecCredits: waec.credits,
      waecHasMathsEnglish: waec.hasMaths && waec.hasEnglish,
      degrees,
      nysc,
      certifications,
      ieltsBand,
      enrolled: current?.status === 'active' || programmes.some((programme) => findProgramme(programme.programmeId)?.schedule !== undefined),
      jambRegistered,
      jambScore: bestJamb?.score ?? null,
      admitted: current !== null,
      ...(await this.currentPlacement(ctx)),
    };
  }

  /** Where the character studies or serves right now, for profile titles ("Student at UNILAG", "Corps member"). */
  private async currentPlacement(ctx: SimulationContext): Promise<Pick<CredentialsSnapshot, 'currentInstitutionId' | 'currentProgramme'>> {
    const current = await this.store.currentEnrolment(ctx);
    const institution = current ? findInstitution(current.institutionId) : undefined;
    const course = current ? findCourse(current.courseId) : undefined;
    if (current && institution && course) {
      const label = `${levelLabel(current.level, course.credential)} ${course.name}`;
      return { currentInstitutionId: institution.venueId, currentProgramme: current.status === 'admitted' ? `Incoming ${label}` : label };
    }
    if ((await this.store.nysc(ctx))?.status === 'serving') return { currentInstitutionId: null, currentProgramme: 'NYSC corps member' };
    const programme = (await this.store.activeProgrammes(ctx))[0];
    return { currentInstitutionId: null, currentProgramme: programme ? (findProgramme(programme.programmeId)?.name ?? null) : null };
  }

  async grantCertification(ctx: SimulationContext, certification: string): Promise<void> {
    await this.certifications.grant(ctx, certification, 'external');
  }
}
