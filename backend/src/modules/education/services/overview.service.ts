import { Injectable } from '@nestjs/common';
import {
  DEGREE_CLASS_LABELS,
  INSTITUTIONS,
  WAEC_SUBJECTS,
  certificationLabel,
  courseTitle,
  findCourse,
  findInstitution,
  findProgramme,
  findVenue,
  isCreditGrade,
  levelLabel,
  sessionFees,
  strikeEventKind,
  type EducationCertificationDto,
  type EducationDegreeDto,
  type EducationOverviewDto,
  type ExamRegistrationDto,
  type InstitutionOptionDto,
  type JambStatusDto,
  type StrikeBannerDto,
  type WaecSubjectGrade,
  type WaecSubjectResultDto,
  type WaecSummaryDto,
} from '@insidelife/shared';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import type { EnrolmentEntity } from '../entities/enrolment.entity.js';
import type { ExamRegistrationEntity } from '../entities/exam-registration.entity.js';
import { AdmissionsService } from './admissions.service.js';
import { EducationStore } from './education-store.service.js';
import { EnrolmentService } from './enrolment.service.js';
import { NyscService } from './nysc.service.js';
import { ProgrammesService } from './programmes.service.js';
import { WaecJambService } from './waec-jamb.service.js';

/** The snapshot summary's education line. */
export interface EducationSummary {
  readonly label: string;
  readonly institution: string | null;
  readonly status: string;
}

/** Builds the School app overview and the one-line education summary. Read-only. */
@Injectable()
export class EducationOverviewService {
  constructor(
    private readonly store: EducationStore,
    private readonly exams: WaecJambService,
    private readonly admissions: AdmissionsService,
    private readonly enrolments: EnrolmentService,
    private readonly nysc: NyscService,
    private readonly programmes: ProgrammesService,
  ) {}

  async overview(ctx: SimulationContext): Promise<EducationOverviewDto> {
    const waec = await this.waecSummary(ctx);
    const exams = (await this.store.exams(ctx)).map((exam) => this.examDto(ctx, exam));
    const applications = (await this.store.applications(ctx)).map((application) => this.admissions.toDto(ctx, application));
    const current = await this.enrolments.current(ctx);
    const degrees = (await this.store.graduated(ctx)).map((degree) => this.degreeDto(degree)).filter((degree) => degree !== null);
    const certifications: EducationCertificationDto[] = (await this.store.certifications(ctx)).map((certification) => ({
      code: certification.code,
      label: certificationLabel(certification.code),
      score: certification.score,
      grantedAt: certification.grantedAt,
    }));

    return {
      asOf: ctx.time,
      headline: (await this.summary(ctx)).label,
      waec,
      jamb: await this.jambStatus(ctx),
      exams: exams.toReversed(),
      applications: applications.toReversed(),
      enrolment: current ? this.enrolments.toDto(ctx, current) : null,
      degrees,
      strike: this.strikeBanner(ctx, current?.enrolment ?? null),
      nysc: await this.nysc.toDto(ctx),
      certifications,
      programmes: (await this.programmes.toDtos(ctx)).toReversed(),
      catalogue: { institutions: await this.institutionOptions(ctx), programmes: await this.programmes.options(ctx) },
      prices: this.exams.prices(ctx),
    };
  }

  /** "200L Computer Science · UNILAG · CGPA 3.82", "Awaiting JAMB result", "B.Sc Accounting (2:1)". */
  async summary(ctx: SimulationContext): Promise<EducationSummary> {
    const current = await this.enrolments.current(ctx);
    if (current) {
      const { enrolment, institution, course } = current;
      const cgpa = enrolment.cgpa !== null ? ` · CGPA ${enrolment.cgpa.toFixed(2)}` : '';
      if (enrolment.status === 'admitted') return { label: `Admitted · ${courseTitle(course)} · ${institution.shortName}`, institution: institution.name, status: 'admitted' };
      const status = enrolment.status === 'suspended' ? 'suspended' : this.enrolments.isOnStrike(ctx, institution, ctx.time) ? 'on strike' : 'student';
      return { label: `${levelLabel(enrolment.level, course.credential)} ${course.name} · ${institution.shortName}${cgpa}`, institution: institution.name, status };
    }

    const degrees = (await this.store.graduated(ctx)).map((degree) => this.degreeDto(degree)).filter((degree) => degree !== null);
    const latest = degrees[degrees.length - 1];
    const nysc = await this.store.nysc(ctx);
    if (nysc?.status === 'serving') {
      return { label: `Corps member${latest ? ` · ${latest.title}` : ''}`, institution: nysc.ppaVenueId ? (findVenue(nysc.ppaVenueId)?.name ?? null) : null, status: 'corps member' };
    }
    const programme = (await this.store.activeProgrammes(ctx))[0];
    if (programme) {
      const definition = findProgramme(programme.programmeId);
      return { label: definition?.name ?? 'Professional programme', institution: definition?.provider ?? null, status: 'in training' };
    }
    if (latest) {
      const short = DEGREE_CLASS_LABELS[latest.degreeClass].short;
      return { label: `${latest.title} (${short})`, institution: latest.institutionName, status: 'graduate' };
    }

    const applications = await this.store.applications(ctx);
    const offer = applications.find((application) => application.status === 'offered');
    if (offer) return { label: `Admission offer · ${findInstitution(offer.institutionId)?.shortName ?? ''}`.trim(), institution: findInstitution(offer.institutionId)?.name ?? null, status: 'offer' };
    const screening = applications.find((application) => application.status === 'screening');
    if (screening) return { label: `Awaiting admission · ${findInstitution(screening.institutionId)?.shortName ?? ''}`.trim(), institution: null, status: 'applied' };

    const latestJamb = await this.exams.latestJamb(ctx);
    if (latestJamb?.status === 'written') return { label: 'Awaiting JAMB result', institution: null, status: 'jamb candidate' };
    if (latestJamb && latestJamb.status !== 'released') return { label: 'JAMB candidate', institution: null, status: 'jamb candidate' };
    const best = await this.exams.bestJamb(ctx);
    if (best && best.score !== null) return { label: `JAMB ${best.score}`, institution: null, status: 'school leaver' };

    const waec = await this.exams.standing(ctx);
    return { label: `SSCE · ${waec.credits} credits`, institution: null, status: 'school leaver' };
  }

  // --- pieces ----------------------------------------------------------------------------------------------------

  private async waecSummary(ctx: SimulationContext): Promise<WaecSummaryDto> {
    const standing = await this.exams.standing(ctx);
    const sittings = (await this.store.waecResults(ctx)).map((result) => ({
      id: result.id,
      kind: result.kind,
      sitting: result.sitting,
      releasedAt: result.releasedAt,
      credits: result.credits,
      subjects: result.subjects.map((subject) => this.subjectDto(subject)),
    }));
    return {
      sittings,
      best: standing.grades.map((grade) => this.subjectDto(grade)),
      credits: standing.credits,
      hasMaths: standing.hasMaths,
      hasEnglish: standing.hasEnglish,
      meetsUniversityMinimum: standing.credits >= 5 && standing.hasMaths && standing.hasEnglish,
    };
  }

  private subjectDto(grade: WaecSubjectGrade): WaecSubjectResultDto {
    return {
      subjectId: grade.subjectId,
      label: WAEC_SUBJECTS.find((subject) => subject.id === grade.subjectId)?.label ?? grade.subjectId,
      grade: grade.grade,
      credit: isCreditGrade(grade.grade),
    };
  }

  private examDto(ctx: SimulationContext, exam: ExamRegistrationEntity): ExamRegistrationDto {
    const institution = exam.institutionId ? findInstitution(exam.institutionId) : undefined;
    const course = exam.courseId ? findCourse(exam.courseId) : undefined;
    // A sitting the player walked out of can be restarted, so it reads as "registered" again.
    const writing = ctx.character.activity?.actionId === 'write-exam' && ctx.character.activity.targetId === exam.id;
    return {
      id: exam.id,
      kind: exam.kind,
      status: exam.status === 'sitting' && !writing ? 'registered' : exam.status,
      venueId: exam.venueId,
      venueName: findVenue(exam.venueId)?.name ?? exam.venueId,
      registeredAt: exam.registeredAt,
      canSitFrom: exam.earliestSittingAt,
      writtenAt: exam.writtenAt,
      resultAt: exam.resultAt,
      score: exam.status === 'released' ? exam.score : null,
      prepHours: Math.round(exam.prepHours * 10) / 10,
      fee: exam.fee,
      firstChoice:
        institution && course ? { institutionId: institution.id, institutionName: institution.name, courseId: course.id, courseName: courseTitle(course) } : null,
    };
  }

  private async jambStatus(ctx: SimulationContext): Promise<JambStatusDto> {
    const latest = await this.exams.latestJamb(ctx);
    const best = await this.exams.bestJamb(ctx);
    const label = this.jambLabel(ctx, latest, best?.score ?? null);
    return { label, current: latest ? this.examDto(ctx, latest) : null, score: best?.score ?? null };
  }

  private jambLabel(ctx: SimulationContext, latest: ExamRegistrationEntity | null, bestScore: number | null): string {
    if (!latest) return 'Register at a CBT centre';
    const activity = ctx.character.activity;
    if (activity?.actionId === 'write-exam' && activity.targetId === latest.id) return 'Writing JAMB now — shine your eye';
    if (latest.status === 'written') return 'Awaiting JAMB result';
    if (latest.status !== 'released') return ctx.time < latest.earliestSittingAt ? 'Registered — prepare for JAMB' : 'Ready to write JAMB';
    return `JAMB ${bestScore ?? latest.score ?? 0}/400`;
  }

  private degreeDto(degree: EnrolmentEntity): EducationDegreeDto | null {
    const course = findCourse(degree.courseId);
    if (!course || !degree.degreeClass || degree.graduatedAt === null) return null;
    return {
      enrolmentId: degree.id,
      credential: course.credential,
      field: course.field,
      title: courseTitle(course),
      institutionName: findInstitution(degree.institutionId)?.name ?? degree.institutionId,
      degreeClass: degree.degreeClass,
      classLabel: DEGREE_CLASS_LABELS[degree.degreeClass].long,
      cgpa: degree.cgpa ?? 0,
      graduatedAt: degree.graduatedAt,
    };
  }

  private strikeBanner(ctx: SimulationContext, enrolment: EnrolmentEntity | null): StrikeBannerDto | null {
    const institution = enrolment ? findInstitution(enrolment.institutionId) : undefined;
    const ownKind = institution ? strikeEventKind(institution) : null;
    const strikes = ctx.world.events(ctx.time).filter((event) => event.kind === 'asuu-strike' || event.kind === 'asup-strike');
    const strike = strikes.find((event) => event.kind === ownKind) ?? strikes[0];
    if (!strike || (strike.kind !== 'asuu-strike' && strike.kind !== 'asup-strike')) return null;
    return {
      kind: strike.kind,
      title: strike.title,
      description: strike.description,
      startedAt: strike.startsAt,
      endsAt: strike.endsAt,
      affectsYou: strike.kind === ownKind && enrolment !== null && ['admitted', 'active'].includes(enrolment.status),
    };
  }

  private async institutionOptions(ctx: SimulationContext): Promise<InstitutionOptionDto[]> {
    const profile = await this.admissions.profile(ctx);
    return INSTITUTIONS.map((institution) => {
      const venue = findVenue(institution.venueId);
      return {
        id: institution.id,
        venueId: institution.venueId,
        name: institution.name,
        shortName: institution.shortName,
        kind: institution.kind,
        prestige: institution.prestige,
        strike: institution.strike,
        minUtme: institution.minUtme,
        acceptanceFee: ctx.world.price(institution.acceptanceFee, ctx.time),
        screeningFee: ctx.world.price(institution.screeningFee, ctx.time),
        hostelFee: ctx.world.price(institution.hostelFee, ctx.time),
        outOfTown: Boolean(venue?.regionId && venue.regionId !== 'lagos'),
        courses: institution.courses.flatMap((offer) => {
          const course = findCourse(offer.courseId);
          if (!course) return [];
          return [
            {
              courseId: course.id,
              title: courseTitle(course),
              credential: course.credential,
              years: course.years,
              cutoff: offer.cutoff,
              sessionFees: ctx.world.price(sessionFees(institution, course, ctx.character.stateOfOrigin), ctx.time),
              ...this.admissions.eligibility(profile, institution, course),
            },
          ];
        }),
      };
    });
  }
}
