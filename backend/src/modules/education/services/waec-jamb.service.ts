import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BACKGROUNDS,
  EXAM_DURATION_MINUTES,
  EXAM_LATEST_START_HOUR,
  EXAM_PREP_DAYS,
  GCE_RESULT_DAYS,
  JAMB_UTME_FEE,
  MINUTES_PER_DAY,
  WAEC_GCE_FEE,
  bestWaecGrades,
  findCourse,
  findCourseOffer,
  findInstitution,
  findVenue,
  formatDate,
  hasWaecCredit,
  isVenueOpen,
  startOfDay,
  toDateParts,
  waecCreditCount,
  type ExamKind,
  type VenueDefinition,
  type WaecSubjectGrade,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import type { ActivityState } from '../../characters/entities/character.entity.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { SimulationEngine } from '../../simulation/simulation-engine.service.js';
import { assertFree } from '../education.helpers.js';
import { jambScore, rollGceResult, rollWaecResult, type ScoredSubject } from '../education.rules.js';
import { ExamRegistrationEntity } from '../entities/exam-registration.entity.js';
import { WaecResultEntity, type StoredWaecSubject } from '../entities/waec-result.entity.js';
import { EDUCATION_MEMO, EducationStore } from './education-store.service.js';

export interface WaecStanding {
  readonly grades: readonly WaecSubjectGrade[];
  readonly credits: number;
  readonly hasMaths: boolean;
  readonly hasEnglish: boolean;
}

const EXAM_LABEL: Readonly<Record<ExamKind, string>> = { jamb: 'JAMB UTME', 'waec-gce': 'WAEC GCE' };
const PENDING_STATUSES: ReadonlySet<string> = new Set(['registered', 'sitting']);

/**
 * WAEC (school result and GCE resits) and JAMB UTME: register at a CBT centre, prepare, write the paper (the
 * `write-exam` system action), and receive the result after it is marked.
 */
@Injectable()
export class WaecJambService {
  constructor(
    private readonly store: EducationStore,
    private readonly engine: SimulationEngine,
  ) {}

  // --- WAEC ------------------------------------------------------------------------------------------------------

  /** The school WAEC result every character starts with (rolled once, deterministically, from the birth lottery). */
  async ensureSchoolWaec(ctx: SimulationContext): Promise<WaecResultEntity> {
    const existing = (await this.store.waecResults(ctx)).find((result) => result.sitting === 1);
    if (existing) return existing;
    const subjects = rollWaecResult(ctx.rng('waec', 'school'), {
      waecMean: BACKGROUNDS[ctx.character.background].waecMean,
      intellect: ctx.character.skills.intellect,
    });
    return this.store.insert(ctx, EDUCATION_MEMO.waec, this.waecRow(ctx, 'waec', 1, subjects, null));
  }

  async standing(ctx: SimulationContext): Promise<WaecStanding> {
    await this.ensureSchoolWaec(ctx);
    const grades = bestWaecGrades((await this.store.waecResults(ctx)).map((result) => result.subjects));
    return {
      grades,
      credits: waecCreditCount(grades),
      hasMaths: hasWaecCredit(grades, 'mathematics'),
      hasEnglish: hasWaecCredit(grades, 'english'),
    };
  }

  // --- Registration & sittings -----------------------------------------------------------------------------------

  async register(ctx: SimulationContext, kind: ExamKind, institutionId?: string, courseId?: string): Promise<ExamRegistrationEntity> {
    assertFree(ctx);
    const venue = this.cbtCentreHere(ctx);
    const exams = (await this.store.exams(ctx)).filter((exam) => exam.kind === kind);
    if (exams.some((exam) => exam.status !== 'released')) {
      throw new GameRuleException('ALREADY_REGISTERED', `You don already register for ${EXAM_LABEL[kind]} — prepare and write that one first.`);
    }
    const choice = this.validateChoice(kind, institutionId, courseId);

    const id = randomUUID();
    const fee = ctx.world.price(kind === 'jamb' ? JAMB_UTME_FEE : WAEC_GCE_FEE, ctx.time);
    await ctx.wallet.pay(fee, 'school-fees', `${EXAM_LABEL[kind]} registration — ${venue.name}`, `exam:${id}`);

    const registration = ctx.manager.create(ExamRegistrationEntity, {
      id,
      characterId: ctx.character.id,
      kind,
      attempt: exams.length + 1,
      status: 'registered',
      venueId: venue.id,
      registeredAt: ctx.time,
      earliestSittingAt: ctx.time + EXAM_PREP_DAYS * MINUTES_PER_DAY,
      institutionId: choice?.institutionId ?? null,
      courseId: choice?.courseId ?? null,
      prepHours: 0,
      fee,
      sittingStartedAt: null,
      writtenAt: null,
      resultAt: null,
      score: null,
      gceSubjects: null,
    });
    await this.store.insert(ctx, EDUCATION_MEMO.exams, registration);

    ctx.notify({
      kind: 'education',
      title: `${EXAM_LABEL[kind]} registered ✍🏾`,
      body: `You can write it here at ${venue.name} from ${formatDate(registration.earliestSittingAt)} (7am-3pm). Read your books — every hour of study counts.`,
      tone: 'good',
    });
    return registration;
  }

  /** Walk into the exam hall: starts the 3-hour `write-exam` action. */
  async startSitting(ctx: SimulationContext, registrationId: string): Promise<ExamRegistrationEntity> {
    const registration = (await this.store.exams(ctx)).find((exam) => exam.id === registrationId);
    if (!registration) throw new ResourceNotFoundException('Exam registration');
    if (!PENDING_STATUSES.has(registration.status)) {
      throw new GameRuleException('ALREADY_WRITTEN', 'You don write this paper already. Wait for your result.');
    }
    assertFree(ctx);

    const venue = findVenue(registration.venueId);
    const venueName = venue?.name ?? 'your CBT centre';
    if (ctx.time < registration.earliestSittingAt) {
      throw new GameRuleException('TOO_EARLY', `Your paper is from ${formatDate(registration.earliestSittingAt)}. Use the time to read!`);
    }
    if (ctx.character.locationId !== registration.venueId) {
      throw new GameRuleException('WRONG_PLACE', `Your exam centre is ${venueName}. Make your way there first.`);
    }
    const hour = toDateParts(ctx.time).hour;
    if ((venue && !isVenueOpen(venue, hour)) || hour > EXAM_LATEST_START_HOUR) {
      throw new GameRuleException('EXAM_HALL_CLOSED', 'Sittings start between 7am and 3pm. Come back tomorrow morning.');
    }

    registration.status = 'sitting';
    registration.sittingStartedAt = ctx.time;
    await this.store.save(ctx, registration);
    this.engine.start(ctx, {
      actionId: 'write-exam',
      startedAt: ctx.time,
      endsAt: ctx.time + EXAM_DURATION_MINUTES,
      locationId: registration.venueId,
      targetId: registration.id,
      cost: 0,
    });
    return registration;
  }

  /** The `write-exam` action finished: mark the paper now, release the result later. */
  async completeSitting(ctx: SimulationContext, activity: ActivityState): Promise<void> {
    const registration = (await this.store.exams(ctx)).find((exam) => exam.id === activity.targetId);
    if (!registration || !PENDING_STATUSES.has(registration.status)) return;
    const input = { intellect: ctx.character.skills.intellect, prepHours: registration.prepHours, mood: this.engine.mood(ctx) };

    registration.status = 'written';
    registration.writtenAt = ctx.time;
    if (registration.kind === 'jamb') {
      registration.score = jambScore(ctx.rng('jamb', registration.attempt), input);
      registration.resultAt = startOfDay(ctx.time) + MINUTES_PER_DAY;
      ctx.notify({ kind: 'education', title: 'Pen down! JAMB done 📝', body: 'JAMB results drop at midnight. Pray small.', tone: 'neutral' });
    } else {
      registration.gceSubjects = this.stored(rollGceResult(ctx.rng('gce', registration.attempt), input));
      registration.resultAt = startOfDay(ctx.time) + GCE_RESULT_DAYS * MINUTES_PER_DAY;
      ctx.notify({
        kind: 'education',
        title: 'GCE papers done',
        body: `WAEC will release your GCE result on ${formatDate(registration.resultAt)}.`,
        tone: 'neutral',
      });
    }
    await this.store.save(ctx, registration);
  }

  /** Day end: publish marked results. */
  async releaseDue(ctx: SimulationContext): Promise<void> {
    for (const registration of await this.store.exams(ctx)) {
      if (registration.status !== 'written' || registration.resultAt === null || registration.resultAt > ctx.time) continue;
      registration.status = 'released';
      await this.store.save(ctx, registration);
      if (registration.kind === 'jamb') this.announceJamb(ctx, registration.score ?? 0);
      else await this.releaseGce(ctx, registration);
    }
  }

  // --- Queries & adjustments -------------------------------------------------------------------------------------

  /** Registrations still to be written (prep goes here). */
  async pending(ctx: SimulationContext): Promise<ExamRegistrationEntity[]> {
    return (await this.store.exams(ctx)).filter((exam) => PENDING_STATUSES.has(exam.status));
  }

  async pendingJamb(ctx: SimulationContext): Promise<ExamRegistrationEntity | null> {
    return (await this.pending(ctx)).find((exam) => exam.kind === 'jamb') ?? null;
  }

  async pendingGce(ctx: SimulationContext): Promise<ExamRegistrationEntity | null> {
    return (await this.pending(ctx)).find((exam) => exam.kind === 'waec-gce') ?? null;
  }

  /** Best released UTME score (the one used for admission). */
  async bestJamb(ctx: SimulationContext): Promise<ExamRegistrationEntity | null> {
    let best: ExamRegistrationEntity | null = null;
    for (const exam of await this.store.exams(ctx)) {
      if (exam.kind !== 'jamb' || exam.status !== 'released' || exam.score === null) continue;
      if (!best || exam.score > (best.score ?? 0)) best = exam;
    }
    return best;
  }

  async latestJamb(ctx: SimulationContext): Promise<ExamRegistrationEntity | null> {
    const jambs = (await this.store.exams(ctx)).filter((exam) => exam.kind === 'jamb');
    return jambs[jambs.length - 1] ?? null;
  }

  async addPrep(ctx: SimulationContext, registration: ExamRegistrationEntity, hours: number): Promise<void> {
    registration.prepHours = Math.round((registration.prepHours + hours) * 100) / 100;
    await this.store.save(ctx, registration);
  }

  /** CBT centre wahala: the earliest sitting moves back. */
  async reschedule(ctx: SimulationContext, registration: ExamRegistrationEntity, days: number): Promise<void> {
    registration.earliestSittingAt = Math.max(registration.earliestSittingAt, ctx.time) + days * MINUTES_PER_DAY;
    await this.store.save(ctx, registration);
  }

  // --- internals -------------------------------------------------------------------------------------------------

  private cbtCentreHere(ctx: SimulationContext): VenueDefinition {
    const venue = findVenue(ctx.character.locationId);
    if (!venue || venue.type !== 'cbt-centre') {
      throw new GameRuleException('WRONG_PLACE', 'Registration happens at a CBT centre — head to the Yaba or Ikeja CBT centre.');
    }
    if (!isVenueOpen(venue, toDateParts(ctx.time).hour)) {
      throw new GameRuleException('CLOSED', `${venue.name} is closed. Come back between 7am and 6pm.`);
    }
    return venue;
  }

  private validateChoice(kind: ExamKind, institutionId?: string, courseId?: string): { institutionId: string; courseId: string } | null {
    if (institutionId === undefined && courseId === undefined) return null;
    if (kind !== 'jamb') throw new GameRuleException('NO_CHOICE_NEEDED', 'GCE has no institution choice — just register and write.');
    if (!institutionId || !courseId) throw new GameRuleException('INCOMPLETE_CHOICE', 'Pick both an institution and a course (or neither).');
    const institution = findInstitution(institutionId);
    if (!institution) throw new ResourceNotFoundException('Institution');
    if (!findCourseOffer(institution, courseId) || findCourse(courseId)?.requiresNd) {
      throw new GameRuleException('COURSE_NOT_OFFERED', `${institution.shortName} doesn’t offer that course through JAMB.`);
    }
    return { institutionId, courseId };
  }

  private announceJamb(ctx: SimulationContext, score: number): void {
    const verdict =
      score >= 300
        ? 'Ọmọ! You don cast JAMB! Top schools are calling.'
        : score >= 250
          ? 'Strong score — you can aim high.'
          : score >= 200
            ? 'Decent. Most federal universities will screen you.'
            : score >= 150
              ? 'You crossed the 150 university minimum. Choose your school wisely.'
              : score >= 100
                ? 'Enough for a polytechnic. Or rewrite and come back stronger.'
                : 'E no reach. Rest, read, and rewrite JAMB.';
    ctx.notify({ kind: 'education', title: `JAMB result: ${score}/400`, body: verdict, tone: score >= 150 ? 'good' : 'bad' });
    ctx.report({ label: `JAMB result: ${score}/400`, tone: score >= 150 ? 'good' : 'bad' });
  }

  private async releaseGce(ctx: SimulationContext, registration: ExamRegistrationEntity): Promise<void> {
    const sittings = await this.store.waecResults(ctx);
    const sitting = sittings.reduce((max, result) => Math.max(max, result.sitting), 0) + 1;
    const subjects = registration.gceSubjects ?? [];
    await this.store.insert(ctx, EDUCATION_MEMO.waec, this.waecRow(ctx, 'gce', sitting, subjects, registration.id));
    const standing = await this.standing(ctx);
    const ready = standing.credits >= 5 && standing.hasMaths && standing.hasEnglish;
    ctx.notify({
      kind: 'education',
      title: `GCE result: ${waecCreditCount(subjects)} credits`,
      body: ready
        ? `Combined with your WAEC you now have ${standing.credits} credits incl. Maths & English. Admission doors are open!`
        : `Combined you have ${standing.credits} credits${standing.hasMaths && standing.hasEnglish ? '' : ' and still no Maths & English credit'}. You fit try again.`,
      tone: ready ? 'good' : 'bad',
    });
    ctx.report({ label: `WAEC GCE released (${waecCreditCount(subjects)} credits)`, tone: ready ? 'good' : 'neutral' });
  }

  private waecRow(
    ctx: SimulationContext,
    kind: 'waec' | 'gce',
    sitting: number,
    subjects: readonly StoredWaecSubject[],
    registrationId: string | null,
  ): WaecResultEntity {
    return ctx.manager.create(WaecResultEntity, {
      characterId: ctx.character.id,
      kind,
      sitting,
      subjects: [...subjects],
      credits: waecCreditCount(subjects),
      releasedAt: ctx.time,
      registrationId,
    });
  }

  private stored(subjects: readonly ScoredSubject[]): StoredWaecSubject[] {
    return subjects.map((subject) => ({ subjectId: subject.subjectId, grade: subject.grade, score: subject.score }));
  }

  /** Human summary of fees for registration screens. */
  prices(ctx: SimulationContext): { readonly jamb: number; readonly waecGce: number } {
    return { jamb: ctx.world.price(JAMB_UTME_FEE, ctx.time), waecGce: ctx.world.price(WAEC_GCE_FEE, ctx.time) };
  }
}
