import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ACCEPTANCE_WINDOW_DAYS,
  ADMISSION_DECISION_DAYS,
  BACKGROUNDS,
  CHANGE_OF_INSTITUTION_FEE,
  MAX_PENDING_APPLICATIONS,
  MINUTES_PER_DAY,
  SUPPLEMENTARY_LIST_MARGIN,
  WAEC_SUBJECTS,
  admissionAggregate,
  courseTitle,
  findCourse,
  findCourseOffer,
  findInstitution,
  formatDate,
  formatNaira,
  hasWaecCredit,
  minimumUtmeFor,
  startOfDay,
  type AcceptanceQuoteDto,
  type AdmissionApplicationDto,
  type CourseDefinition,
  type Eligibility,
  type InstitutionDefinition,
} from '@insidelife/shared';
import { GameRuleException, InsufficientFundsException, ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { SimulationEngine } from '../../simulation/simulation-engine.service.js';
import { hndEntryPoints, screeningScore, supplementaryChance } from '../education.rules.js';
import { AdmissionApplicationEntity } from '../entities/admission-application.entity.js';
import type { EnrolmentEntity } from '../entities/enrolment.entity.js';
import type { ExamRegistrationEntity } from '../entities/exam-registration.entity.js';
import { EDUCATION_MEMO, EducationStore } from './education-store.service.js';
import { EnrolmentService } from './enrolment.service.js';
import { WaecJambService, type WaecStanding } from './waec-jamb.service.js';

/** Everything admission eligibility depends on, loaded once per request. */
export interface AdmissionProfile {
  readonly waec: WaecStanding;
  /** Best released UTME result. */
  readonly jamb: ExamRegistrationEntity | null;
  readonly ndDiplomas: readonly EnrolmentEntity[];
  readonly enrolled: boolean;
  readonly applications: readonly AdmissionApplicationEntity[];
}

const OPEN_STATUSES: ReadonlySet<string> = new Set(['screening', 'offered']);
const ok: Eligibility = { eligible: true, reason: null };
const no = (reason: string): Eligibility => ({ eligible: false, reason });

/**
 * Post-UTME admissions: eligibility (JAMB minimum, O'level credits), screening, decisions after a few game days
 * (aggregate vs cut-off, catchment bonus, supplementary list), offers and acceptance.
 */
@Injectable()
export class AdmissionsService {
  constructor(
    private readonly store: EducationStore,
    private readonly exams: WaecJambService,
    private readonly enrolments: EnrolmentService,
    private readonly engine: SimulationEngine,
  ) {}

  async profile(ctx: SimulationContext): Promise<AdmissionProfile> {
    const waec = await this.exams.standing(ctx);
    const jamb = await this.exams.bestJamb(ctx);
    const graduated = await this.store.graduated(ctx);
    const current = await this.store.currentEnrolment(ctx);
    const applications = await this.store.applications(ctx);
    return {
      waec,
      jamb,
      ndDiplomas: graduated.filter((enrolment) => findCourse(enrolment.courseId)?.credential === 'nd'),
      enrolled: current !== null,
      applications,
    };
  }

  /** First unmet requirement for a course at an institution, in the order a careful aunty would check them. */
  eligibility(profile: AdmissionProfile, institution: InstitutionDefinition, course: CourseDefinition): Eligibility {
    if (profile.enrolled) return no('Withdraw from your current programme before applying elsewhere');

    if (course.requiresNd) {
      if (!this.matchingDiploma(profile, course)) return no(`HND entry needs an ND in ${course.name}`);
    } else {
      const score = profile.jamb?.score ?? null;
      if (score === null) return no('Write JAMB first');
      const minimum = minimumUtmeFor(institution);
      if (score < minimum) return no(`${institution.shortName} needs at least ${minimum} in JAMB (you scored ${score})`);
    }

    const { waec } = profile;
    if (!waec.hasEnglish || !waec.hasMaths) return no('You need credits in English and Maths — resit with WAEC GCE');
    if (waec.credits < course.minCredits) return no(`You need ${course.minCredits} WAEC credits (you have ${waec.credits})`);
    for (const subjectId of course.requiredCredits) {
      if (!hasWaecCredit(waec.grades, subjectId)) {
        const label = WAEC_SUBJECTS.find((subject) => subject.id === subjectId)?.label ?? subjectId;
        return no(`${course.name} needs a credit in ${label}`);
      }
    }

    const sameChoice = profile.applications.filter((application) => application.institutionId === institution.id && application.courseId === course.id);
    if (sameChoice.some((application) => OPEN_STATUSES.has(application.status))) return no('You’ve already applied for this course');
    if (sameChoice.some((application) => application.status === 'rejected' && application.examRegistrationId === (course.requiresNd ? null : (profile.jamb?.id ?? null)))) {
      return no('They already turned you down with this result — rewrite JAMB or try elsewhere');
    }
    const open = profile.applications.filter((application) => OPEN_STATUSES.has(application.status)).length;
    if (open >= MAX_PENDING_APPLICATIONS) return no(`You can only have ${MAX_PENDING_APPLICATIONS} applications in progress`);
    return ok;
  }

  async apply(ctx: SimulationContext, institutionId: string, courseId: string): Promise<AdmissionApplicationEntity> {
    const institution = findInstitution(institutionId);
    if (!institution) throw new ResourceNotFoundException('Institution');
    const offer = findCourseOffer(institution, courseId);
    const course = findCourse(courseId);
    if (!offer || !course) throw new GameRuleException('COURSE_NOT_OFFERED', `${institution.shortName} doesn’t offer that course.`);

    const profile = await this.profile(ctx);
    const eligibility = this.eligibility(profile, institution, course);
    if (!eligibility.eligible) throw new GameRuleException('NOT_ELIGIBLE', eligibility.reason ?? 'You don’t meet the requirements yet');

    const jamb = course.requiresNd ? null : profile.jamb;
    const diploma = course.requiresNd ? this.matchingDiploma(profile, course) : null;
    const changeOfInstitution = jamb?.institutionId && jamb.institutionId !== institution.id ? ctx.world.price(CHANGE_OF_INSTITUTION_FEE, ctx.time) : 0;
    const fee = ctx.world.price(institution.screeningFee, ctx.time) + changeOfInstitution;

    const id = randomUUID();
    await ctx.wallet.pay(fee, 'school-fees', `${institution.shortName} post-UTME screening${changeOfInstitution > 0 ? ' + change of institution' : ''}`, `admission:${id}`);

    const entryKey = jamb ? `jamb-${jamb.attempt}` : `nd-${diploma?.id ?? 'none'}`;
    const application = ctx.manager.create(AdmissionApplicationEntity, {
      id,
      characterId: ctx.character.id,
      examRegistrationId: jamb?.id ?? null,
      institutionId: institution.id,
      courseId: course.id,
      status: 'screening',
      utmeScore: jamb?.score ?? null,
      entryPoints: diploma ? hndEntryPoints(diploma.cgpa ?? 0) : null,
      screeningScore: screeningScore(ctx.rng('screening', entryKey, institution.id, course.id), {
        intellect: ctx.character.skills.intellect,
        mood: this.engine.mood(ctx),
      }),
      aggregate: null,
      cutoff: offer.cutoff,
      catchmentBonus: institution.catchment?.stateId === ctx.character.stateOfOrigin ? institution.catchment.bonus : 0,
      supplementaryList: false,
      feePaid: fee,
      appliedAt: ctx.time,
      decisionAt: startOfDay(ctx.time) + ADMISSION_DECISION_DAYS * MINUTES_PER_DAY,
      decidedAt: null,
      acceptBy: null,
    });
    await this.store.insert(ctx, EDUCATION_MEMO.applications, application);
    ctx.notify({
      kind: 'education',
      title: `Applied to ${institution.shortName} ✍🏾`,
      body: `Post-UTME screening for ${courseTitle(course)} is done. Admission list comes out ${formatDate(application.decisionAt)}.`,
      tone: 'neutral',
    });
    return application;
  }

  async accept(ctx: SimulationContext, applicationId: string): Promise<EnrolmentEntity> {
    const application = (await this.store.applications(ctx)).find((candidate) => candidate.id === applicationId);
    if (!application) throw new ResourceNotFoundException('Application');
    if (application.status === 'expired' || (application.acceptBy !== null && ctx.time > application.acceptBy)) {
      throw new GameRuleException('OFFER_EXPIRED', 'This offer has lapsed. Apply again next time — and don’t sleep on it.');
    }
    if (application.status !== 'offered') throw new GameRuleException('NO_OFFER', 'There’s no admission offer to accept here.');
    if (await this.store.currentEnrolment(ctx)) throw new GameRuleException('ALREADY_ENROLLED', 'You’re already enrolled. Withdraw first if you want to switch.');

    const institution = findInstitution(application.institutionId);
    const course = findCourse(application.courseId);
    if (!institution || !course) throw new ResourceNotFoundException('Programme');
    const quote = this.quote(ctx, institution, course);
    if (!ctx.wallet.canAfford(quote.total)) throw new InsufficientFundsException(quote.total);

    await ctx.wallet.pay(quote.acceptanceFee, 'school-fees', `${institution.shortName} acceptance fee`, `acceptance:${application.id}`);
    if (!quote.sponsoredByParents) {
      await ctx.wallet.pay(quote.firstSessionFees, 'school-fees', `${institution.shortName} first session fees`, `fees:${application.id}:1`);
    }
    application.status = 'accepted';
    await this.store.save(ctx, application);
    await this.store.declineOthers(ctx, application.id);
    const enrolment = await this.enrolments.create(ctx, application, quote.sponsoredByParents);

    ctx.notify({
      kind: 'education',
      title: `Welcome to ${institution.shortName}! 🎉`,
      body: `You’re now a ${courseTitle(course)} student. Resumption is ${formatDate(enrolment.startsAt)}.`,
      tone: 'good',
    });
    if (quote.sponsoredByParents) {
      ctx.notify({
        kind: 'family',
        title: 'Your parents paid your school fees ❤️',
        body: `Daddy and Mummy covered your first session (${formatNaira(quote.firstSessionFees)}). “Make us proud — no carry-overs o.”`,
        tone: 'good',
      });
    }
    return enrolment;
  }

  /** Day end: publish admission lists and lapse unanswered offers. */
  async onDayEnd(ctx: SimulationContext): Promise<void> {
    for (const application of await this.store.applications(ctx)) {
      if (application.status === 'screening' && application.decisionAt <= ctx.time) await this.decide(ctx, application);
      else if (application.status === 'offered' && application.acceptBy !== null && application.acceptBy < ctx.time) await this.lapse(ctx, application);
    }
  }

  quote(ctx: SimulationContext, institution: InstitutionDefinition, course: CourseDefinition): AcceptanceQuoteDto {
    const acceptanceFee = ctx.world.price(institution.acceptanceFee, ctx.time);
    const firstSessionFees = this.enrolments.sessionFeesNow(ctx, institution, course);
    const sponsoredByParents = this.parentsSponsor(ctx, institution);
    return { acceptanceFee, firstSessionFees, sponsoredByParents, total: acceptanceFee + (sponsoredByParents ? 0 : firstSessionFees) };
  }

  toDto(ctx: SimulationContext, application: AdmissionApplicationEntity): AdmissionApplicationDto {
    const institution = findInstitution(application.institutionId);
    const course = findCourse(application.courseId);
    const decided = application.decidedAt !== null;
    return {
      id: application.id,
      institutionId: application.institutionId,
      institutionName: institution?.name ?? application.institutionId,
      courseId: application.courseId,
      courseName: course ? courseTitle(course) : application.courseId,
      status: application.status,
      appliedAt: application.appliedAt,
      decisionAt: application.decisionAt,
      utmeScore: application.utmeScore,
      screeningScore: decided ? application.screeningScore : null,
      aggregate: decided ? application.aggregate : null,
      cutoff: application.cutoff,
      catchmentBonus: application.catchmentBonus,
      supplementaryList: application.supplementaryList,
      acceptBy: application.acceptBy,
      acceptance: application.status === 'offered' && institution && course ? this.quote(ctx, institution, course) : null,
    };
  }

  // --- internals -------------------------------------------------------------------------------------------------

  /** Birth-lottery perk: parents pay the first session (public schools for Ajebota, any school for Nepo babies). */
  private parentsSponsor(ctx: SimulationContext, institution: InstitutionDefinition): boolean {
    if (ctx.character.generation > 1) return false;
    const sponsors = BACKGROUNDS[ctx.character.background].sponsorsFees;
    return sponsors === 'private' || (sponsors === 'public' && institution.kind !== 'private');
  }

  private matchingDiploma(profile: AdmissionProfile, course: CourseDefinition): EnrolmentEntity | null {
    return profile.ndDiplomas.find((diploma) => findCourse(diploma.courseId)?.field === course.field) ?? null;
  }

  private async decide(ctx: SimulationContext, application: AdmissionApplicationEntity): Promise<void> {
    const institution = findInstitution(application.institutionId);
    const course = findCourse(application.courseId);
    const aggregate =
      application.utmeScore !== null
        ? admissionAggregate(application.utmeScore, application.screeningScore, application.catchmentBonus)
        : admissionAggregate(0, application.screeningScore, application.catchmentBonus + (application.entryPoints ?? 0));
    const shortfall = Math.round((application.cutoff - aggregate) * 100) / 100;
    const entryKey = application.examRegistrationId ?? 'direct-entry';
    const admitted =
      shortfall <= 0 ||
      ctx.rng('admission', entryKey, application.institutionId, application.courseId).chance(supplementaryChance(shortfall, SUPPLEMENTARY_LIST_MARGIN, ctx.character.connections));

    application.aggregate = aggregate;
    application.decidedAt = ctx.time;
    application.supplementaryList = admitted && shortfall > 0;
    application.status = admitted ? 'offered' : 'rejected';
    application.acceptBy = admitted ? ctx.time + ACCEPTANCE_WINDOW_DAYS * MINUTES_PER_DAY : null;
    await this.store.save(ctx, application);

    const school = institution?.shortName ?? 'the school';
    const title = course ? courseTitle(course) : 'your course';
    if (admitted) {
      ctx.notify({
        kind: 'education',
        title: `Admission! ${school} said YES 🎉`,
        body: `${title} — aggregate ${aggregate.toFixed(1)} vs cut-off ${application.cutoff}${application.supplementaryList ? ' (you made the supplementary list!)' : ''}. Accept by ${formatDate(application.acceptBy ?? ctx.time)}.`,
        tone: 'good',
      });
      ctx.report({ label: `Admission offer from ${school}`, tone: 'good' });
    } else {
      ctx.notify({
        kind: 'education',
        title: `No admission from ${school} this time`,
        body: `Cut-off for ${title} was ${application.cutoff}; your aggregate was ${aggregate.toFixed(1)}. Try a less competitive course or school — or rewrite JAMB.`,
        tone: 'bad',
      });
      ctx.report({ label: `${school} admission: not this time`, tone: 'bad' });
    }
  }

  private async lapse(ctx: SimulationContext, application: AdmissionApplicationEntity): Promise<void> {
    application.status = 'expired';
    await this.store.save(ctx, application);
    const school = findInstitution(application.institutionId)?.shortName ?? 'the school';
    ctx.notify({ kind: 'education', title: `${school} offer lapsed`, body: 'You didn’t accept in time, so the slot went to someone else.', tone: 'bad' });
  }
}
