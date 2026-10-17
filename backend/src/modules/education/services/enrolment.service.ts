import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DEGREE_CLASS_LABELS,
  FEES_GRACE_DAYS,
  LECTURE_END_HOUR,
  LECTURE_START_HOUR,
  MAX_EXTRA_SEMESTERS,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MINUTES_PER_MONTH,
  SEMESTERS_PER_SESSION,
  SEMESTER_MONTHS,
  applySkillXp,
  courseTitle,
  degreeClassFor,
  findCourse,
  findInstitution,
  formatDate,
  formatNaira,
  levelLabel,
  moodPerformanceMultiplier,
  sessionFees,
  startOfMonth,
  strikeEventKind,
  worldEventMinutesBetween,
  type CourseDefinition,
  type EducationEnrolmentDto,
  type GameMinute,
  type InstitutionDefinition,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';
import { GameRuleException } from '../../../common/exceptions/domain.exception.js';
import type { ScheduleBlock, Segment } from '../../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { SimulationEngine } from '../../simulation/simulation-engine.service.js';
import { LECTURE_PRIORITY, addMoodModifier, dayWindow, isWorkingDay } from '../education.helpers.js';
import {
  CAMPUS_STUDY_BONUS,
  LECTURE_MASTERY_PER_HOUR,
  STUDY_MASTERY_PER_HOUR,
  cumulativeGpa,
  dailyProgressMinutes,
  learningFactor,
  semesterGpa,
  strikeAdjustedEnd,
} from '../education.rules.js';
import type { AdmissionApplicationEntity } from '../entities/admission-application.entity.js';
import { EnrolmentEntity, type SemesterRecord } from '../entities/enrolment.entity.js';
import { EDUCATION_MEMO, EducationStore } from './education-store.service.js';

export const SEMESTER_MINUTES = SEMESTER_MONTHS * MINUTES_PER_MONTH;
const LECTURE_MINUTES_PER_DAY = (LECTURE_END_HOUR - LECTURE_START_HOUR) * MINUTES_PER_HOUR;
/** Beats the home (10) while a session runs; a hospital ward (30) still wins. */
/** Mastery points for a top grade on a typical (difficulty 1) course. */
const MASTERY_BASE = 100;

export interface ResolvedEnrolment {
  readonly enrolment: EnrolmentEntity;
  readonly institution: InstitutionDefinition;
  readonly course: CourseDefinition;
}

/**
 * University and polytechnic life: lectures on the weekday routine, attendance
 * and mastery, semester results every six months of effective (non-strike) time, session fees with a 30-day grace
 * period, and graduation with a class of degree.
 */
@Injectable()
export class EnrolmentService {
  constructor(
    private readonly store: EducationStore,
    private readonly engine: SimulationEngine,
  ) {}

  async current(ctx: SimulationContext): Promise<ResolvedEnrolment | null> {
    const enrolment = await this.store.currentEnrolment(ctx);
    return enrolment ? EnrolmentService.resolve(enrolment) : null;
  }

  static resolve(enrolment: EnrolmentEntity): ResolvedEnrolment | null {
    const institution = findInstitution(enrolment.institutionId);
    const course = findCourse(enrolment.courseId);
    return institution && course ? { enrolment, institution, course } : null;
  }

  static totalSemesters(enrolment: EnrolmentEntity, course: CourseDefinition): number {
    return course.years * SEMESTERS_PER_SESSION + enrolment.extraSemesters;
  }

  /** Tuition + hostel for one session at today's prices. */
  sessionFeesNow(ctx: SimulationContext, institution: InstitutionDefinition, course: CourseDefinition): number {
    return ctx.world.price(sessionFees(institution, course, ctx.character.stateOfOrigin), ctx.time);
  }

  isOnStrike(ctx: SimulationContext, institution: InstitutionDefinition, t: GameMinute): boolean {
    const kind = strikeEventKind(institution);
    return kind !== null && ctx.world.isActive(t, kind);
  }

  /** Lectures are running for this student at time `t` (session started, not suspended, no strike). */
  inSession(ctx: SimulationContext, resolved: ResolvedEnrolment, t: GameMinute): boolean {
    const { enrolment, institution } = resolved;
    return enrolment.status === 'active' && t >= enrolment.startsAt && !this.isOnStrike(ctx, institution, t);
  }

  /** Accepting an offer: the session starts on the 1st of the next game month. */
  async create(ctx: SimulationContext, application: AdmissionApplicationEntity, sponsored: boolean): Promise<EnrolmentEntity> {
    const course = findCourse(application.courseId);
    const startsAt = startOfMonth(ctx.time) + MINUTES_PER_MONTH;
    const enrolment = ctx.manager.create(EnrolmentEntity, {
      id: randomUUID(),
      characterId: ctx.character.id,
      applicationId: application.id,
      institutionId: application.institutionId,
      courseId: application.courseId,
      status: 'admitted',
      level: 1,
      session: 1,
      semester: 1,
      completedSemesters: 0,
      extraSemesters: 0,
      startsAt,
      progressMinutes: 0,
      pausedMinutes: 0,
      mastery: 0,
      lectureMinutesScheduled: 0,
      lectureMinutesAttended: 0,
      semesterResults: [],
      cgpa: null,
      feesDue: 0,
      feesDueAt: null,
      feesPaidSessions: 1,
      sponsoredFirstSession: sponsored,
      suspendedAt: null,
      onStrike: false,
      graduatedAt: null,
      degreeClass: null,
      endedAt: null,
    });
    await this.store.insert(ctx, EDUCATION_MEMO.enrolments, enrolment);
    this.invalidateRoutine(ctx);
    ctx.report({ label: `Accepted admission: ${course ? courseTitle(course) : 'new programme'}`, tone: 'good' });
    return enrolment;
  }

  // --- Routine hooks ---------------------------------------------------------------------------------------------

  async lectureBlock(ctx: SimulationContext, dayIndex: number): Promise<ScheduleBlock | null> {
    const resolved = await this.current(ctx);
    if (!resolved) return null;
    const window = dayWindow(dayIndex, LECTURE_START_HOUR, LECTURE_END_HOUR);
    if (!this.inSession(ctx, resolved, window.startsAt) || !isWorkingDay(ctx, window.startsAt)) return null;
    return {
      kind: 'lecture',
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      locationId: resolved.institution.venueId,
      label: `Lectures at ${resolved.institution.shortName}`,
      priority: LECTURE_PRIORITY,
      commute: true,
    };
  }

  /** Attendance and lecture mastery from routine lecture segments at the campus. */
  async recordSegment(ctx: SimulationContext, segment: Segment): Promise<void> {
    if (segment.kind !== 'lecture') return;
    const resolved = await this.current(ctx);
    if (!resolved || resolved.enrolment.status !== 'active' || segment.locationId !== resolved.institution.venueId) return;
    const minutes = segment.endsAt - segment.startsAt;
    const enrolment = resolved.enrolment;
    enrolment.lectureMinutesAttended += minutes;
    enrolment.mastery += (minutes / MINUTES_PER_HOUR) * LECTURE_MASTERY_PER_HOUR * this.learningRate(ctx);
    await this.store.save(ctx, enrolment);
  }

  /** Self-study hours (the campus library counts extra). */
  async addStudy(ctx: SimulationContext, resolved: ResolvedEnrolment, hours: number, atCampus: boolean): Promise<void> {
    const enrolment = resolved.enrolment;
    enrolment.mastery += hours * STUDY_MASTERY_PER_HOUR * this.learningRate(ctx) * (atCampus ? CAMPUS_STUDY_BONUS : 1);
    await this.store.save(ctx, enrolment);
  }

  /** Life events nudge this semester's mastery (handouts, group projects, sorting gone wrong). */
  async adjustMastery(ctx: SimulationContext, resolved: ResolvedEnrolment, delta: number): Promise<void> {
    resolved.enrolment.mastery = Math.max(0, resolved.enrolment.mastery + delta);
    await this.store.save(ctx, resolved.enrolment);
  }

  // --- Day end ---------------------------------------------------------------------------------------------------

  /** Advance the programme by one day. Returns the enrolment if the student graduated tonight. */
  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<ResolvedEnrolment | null> {
    const resolved = await this.current(ctx);
    if (!resolved) return null;
    const { enrolment, institution } = resolved;
    const dayStart = dayIndex * MINUTES_PER_DAY;

    if (await this.lectureBlock(ctx, dayIndex)) enrolment.lectureMinutesScheduled += LECTURE_MINUTES_PER_DAY;

    if (enrolment.status === 'active' && dayStart >= enrolment.startsAt) {
      const kind = strikeEventKind(institution);
      const strikeToday = kind ? worldEventMinutesBetween(ctx.world.seed, kind, dayStart, dayStart + MINUTES_PER_DAY) : 0;
      enrolment.progressMinutes += dailyProgressMinutes(strikeToday, false);
    } else if (enrolment.status === 'suspended') {
      enrolment.pausedMinutes += MINUTES_PER_DAY;
    }

    if (enrolment.status === 'admitted' && ctx.time >= enrolment.startsAt) this.resume(ctx, resolved);
    this.noticeStrike(ctx, resolved);

    let graduated = false;
    while (enrolment.status === 'active' && enrolment.progressMinutes >= (enrolment.completedSemesters + 1) * SEMESTER_MINUTES) {
      graduated = this.closeSemester(ctx, resolved) || graduated;
    }
    this.enforceFees(ctx, resolved);

    await this.store.save(ctx, enrolment);
    return graduated ? resolved : null;
  }

  // --- Player commands -------------------------------------------------------------------------------------------

  async payFees(ctx: SimulationContext): Promise<ResolvedEnrolment> {
    const resolved = await this.current(ctx);
    if (!resolved) throw new GameRuleException('NOT_ENROLLED', 'You’re not enrolled anywhere right now.');
    const { enrolment, institution } = resolved;
    if (enrolment.feesDue <= 0) throw new GameRuleException('NO_FEES_DUE', 'You don’t owe school fees right now. Enjoy it while it lasts.');

    const amount = enrolment.feesDue;
    await ctx.wallet.pay(amount, 'school-fees', `${institution.shortName} school fees — ${levelLabel(enrolment.level, resolved.course.credential)}`, `fees:${enrolment.id}:${enrolment.session}:${enrolment.completedSemesters}`);
    enrolment.feesDue = 0;
    enrolment.feesDueAt = null;
    enrolment.feesPaidSessions += 1;
    const wasSuspended = enrolment.status === 'suspended';
    if (wasSuspended) {
      enrolment.status = 'active';
      enrolment.suspendedAt = null;
      this.invalidateRoutine(ctx);
    }
    await this.store.save(ctx, enrolment);
    ctx.notify({
      kind: 'education',
      title: wasSuspended ? 'Reinstated! 🎒' : 'School fees paid ✅',
      body: wasSuspended
        ? `${formatNaira(amount)} paid. Your suspension at ${institution.shortName} is lifted — back to class.`
        : `${formatNaira(amount)} paid to ${institution.shortName}. Bursary stamped your receipt.`,
      tone: 'good',
    });
    return resolved;
  }

  async dropOut(ctx: SimulationContext): Promise<void> {
    const resolved = await this.current(ctx);
    if (!resolved) throw new GameRuleException('NOT_ENROLLED', 'You’re not enrolled anywhere right now.');
    const { enrolment, institution, course } = resolved;
    enrolment.status = 'withdrawn';
    enrolment.endedAt = ctx.time;
    enrolment.feesDue = 0;
    await this.store.save(ctx, enrolment);
    this.invalidateRoutine(ctx);
    ctx.notify({
      kind: 'education',
      title: 'You’ve withdrawn',
      body: `You left ${courseTitle(course)} at ${institution.shortName}. No refunds — but plenty of billionaires dropped out too. Make it count.`,
      tone: 'neutral',
    });
  }

  // --- Views -----------------------------------------------------------------------------------------------------

  toDto(ctx: SimulationContext, resolved: ResolvedEnrolment): EducationEnrolmentDto {
    const { enrolment, institution, course } = resolved;
    const totalSemesters = EnrolmentService.totalSemesters(enrolment, course);
    const requirement = MASTERY_BASE * course.difficulty;
    return {
      id: enrolment.id,
      institutionId: institution.id,
      institutionName: institution.name,
      courseId: course.id,
      title: courseTitle(course),
      credential: course.credential,
      status: enrolment.status,
      level: levelLabel(enrolment.level, course.credential),
      session: enrolment.session,
      semester: enrolment.semester,
      totalSemesters,
      progressPercent: Math.min(100, Math.round((enrolment.progressMinutes / (totalSemesters * SEMESTER_MINUTES)) * 1000) / 10),
      masteryPercent: Math.round((enrolment.mastery / requirement) * 100),
      attendancePercent:
        enrolment.lectureMinutesScheduled > 0 ? Math.min(100, Math.round((enrolment.lectureMinutesAttended / enrolment.lectureMinutesScheduled) * 100)) : 100,
      cgpa: enrolment.cgpa,
      projectedClass: enrolment.cgpa === null ? null : degreeClassFor(enrolment.cgpa, course.credential),
      semesterResults: enrolment.semesterResults.map((record) => ({
        session: record.session,
        semester: record.semester,
        level: levelLabel(record.level, course.credential),
        gpa: record.gpa,
        attendance: record.attendance,
        mastery: record.mastery,
      })),
      startsAt: enrolment.startsAt,
      expectedGraduationAt: this.expectedEnd(ctx, resolved),
      strikeDelayMinutes: this.strikeMinutesSoFar(ctx, resolved),
      onStrike: this.isOnStrike(ctx, institution, ctx.time),
      fees: {
        due: enrolment.feesDue,
        dueAt: enrolment.feesDueAt,
        graceUntil: enrolment.feesDue > 0 && enrolment.feesDueAt !== null ? enrolment.feesDueAt + FEES_GRACE_DAYS * MINUTES_PER_DAY : null,
        paidSessions: enrolment.feesPaidSessions,
      },
    };
  }

  /** Planned end pushed back by strikes and suspension so far. */
  expectedEnd(ctx: SimulationContext, resolved: ResolvedEnrolment): GameMinute {
    const { enrolment, course } = resolved;
    const plannedEnd = enrolment.startsAt + EnrolmentService.totalSemesters(enrolment, course) * SEMESTER_MINUTES;
    return strikeAdjustedEnd(plannedEnd, this.strikeMinutesSoFar(ctx, resolved), enrolment.pausedMinutes);
  }

  strikeMinutesSoFar(ctx: SimulationContext, resolved: ResolvedEnrolment): number {
    const kind = strikeEventKind(resolved.institution);
    if (!kind || ctx.time <= resolved.enrolment.startsAt) return 0;
    return worldEventMinutesBetween(ctx.world.seed, kind, resolved.enrolment.startsAt, ctx.time);
  }

  // --- internals -------------------------------------------------------------------------------------------------

  private learningRate(ctx: SimulationContext): number {
    return learningFactor(ctx.character.skills.intellect) * moodPerformanceMultiplier(this.engine.mood(ctx));
  }

  private resume(ctx: SimulationContext, resolved: ResolvedEnrolment): void {
    const { enrolment, institution, course } = resolved;
    enrolment.status = 'active';
    this.invalidateRoutine(ctx);
    ctx.notify({
      kind: 'education',
      title: 'Resumption day! 🎒',
      body: `${levelLabel(enrolment.level, course.credential)} ${course.name} at ${institution.shortName} starts today. Lectures run weekdays 9am-3pm.`,
      tone: 'good',
    });
  }

  private noticeStrike(ctx: SimulationContext, resolved: ResolvedEnrolment): void {
    const { enrolment, institution } = resolved;
    if (enrolment.status !== 'active' && enrolment.status !== 'admitted') return;
    const striking = this.isOnStrike(ctx, institution, ctx.time);
    if (striking === enrolment.onStrike) return;
    enrolment.onStrike = striking;
    this.invalidateRoutine(ctx);
    const union = institution.strike === 'asup' ? 'ASUP' : 'ASUU';
    ctx.notify(
      striking
        ? {
            kind: 'education',
            title: `${union} don strike! 😩`,
            body: `Lectures at ${institution.shortName} are suspended until further notice. Your graduation date will shift by however long it lasts.`,
            tone: 'bad',
          }
        : {
            kind: 'education',
            title: 'Strike called off! 🎉',
            body: `Lectures resume at ${institution.shortName}. Dust your notes — exams no go wait for you.`,
            tone: 'good',
          },
    );
    ctx.report({ label: striking ? `${union} strike shut ${institution.shortName}` : `${union} strike ended`, tone: striking ? 'bad' : 'good' });
  }

  /** Semester results; returns true when the student graduated. */
  private closeSemester(ctx: SimulationContext, resolved: ResolvedEnrolment): boolean {
    const { enrolment, course } = resolved;
    const requirement = MASTERY_BASE * course.difficulty;
    const attendance = enrolment.lectureMinutesScheduled > 0 ? Math.min(1, enrolment.lectureMinutesAttended / enrolment.lectureMinutesScheduled) : 1;
    const gpa = semesterGpa(ctx.rng('semester', enrolment.id, enrolment.completedSemesters), {
      mastery: enrolment.mastery,
      requirement,
      attendance,
      mood: this.engine.mood(ctx),
    });
    const masteryRatio = Math.round((enrolment.mastery / requirement) * 100) / 100;
    const record: SemesterRecord = {
      session: enrolment.session,
      semester: enrolment.semester,
      level: enrolment.level,
      gpa,
      attendance: Math.round(attendance * 100) / 100,
      mastery: masteryRatio,
      endedAt: ctx.time,
    };
    enrolment.semesterResults = [...enrolment.semesterResults, record];
    enrolment.cgpa = cumulativeGpa(enrolment.semesterResults.map((result) => result.gpa));
    this.growSkills(ctx, course.skill, masteryRatio);
    enrolment.mastery = 0;
    enrolment.lectureMinutesAttended = 0;
    enrolment.lectureMinutesScheduled = 0;
    enrolment.completedSemesters += 1;

    ctx.notify({
      kind: 'education',
      title: `Results are out: GPA ${gpa.toFixed(2)}`,
      body: `${levelLabel(enrolment.level, course.credential)} semester ${enrolment.semester} — CGPA now ${(enrolment.cgpa ?? 0).toFixed(2)}. Attendance ${Math.round(attendance * 100)}%.`,
      tone: gpa >= 3.5 ? 'good' : gpa >= 2.4 ? 'neutral' : 'bad',
    });
    ctx.report({ label: `Semester GPA ${gpa.toFixed(2)} (CGPA ${(enrolment.cgpa ?? 0).toFixed(2)})`, tone: gpa >= 2.4 ? 'good' : 'bad' });

    if (enrolment.completedSemesters >= EnrolmentService.totalSemesters(enrolment, course)) return this.finish(ctx, resolved);
    if (enrolment.completedSemesters % SEMESTERS_PER_SESSION === 0) this.startNewSession(ctx, resolved);
    else enrolment.semester = SEMESTERS_PER_SESSION;
    return false;
  }

  private growSkills(ctx: SimulationContext, skill: SkillKey, masteryRatio: number): void {
    const skills: Record<SkillKey, number> = { ...ctx.character.skills };
    skills[skill] = applySkillXp(skills[skill], 7 * Math.min(1.3, masteryRatio));
    skills.intellect = applySkillXp(skills.intellect, 1.5 * Math.min(1.3, masteryRatio));
    ctx.character.skills = skills as Skills;
  }

  private startNewSession(ctx: SimulationContext, resolved: ResolvedEnrolment): void {
    const { enrolment, institution, course } = resolved;
    enrolment.session += 1;
    enrolment.level = Math.min(course.years, enrolment.level + 1);
    enrolment.semester = 1;
    this.chargeFees(ctx, resolved, this.sessionFeesNow(ctx, institution, course), `New session: ${levelLabel(enrolment.level, course.credential)} 📚`);
  }

  private chargeFees(ctx: SimulationContext, resolved: ResolvedEnrolment, amount: number, title: string): void {
    const { enrolment, institution } = resolved;
    enrolment.feesDue = amount;
    enrolment.feesDueAt = ctx.time;
    ctx.notify({
      kind: 'bill',
      title,
      body: `${institution.shortName} fees of ${formatNaira(amount)} are due. Pay within ${FEES_GRACE_DAYS} days (by ${formatDate(ctx.time + FEES_GRACE_DAYS * MINUTES_PER_DAY)}) or you’ll be suspended.`,
      tone: 'neutral',
    });
    ctx.report({ label: `School fees due at ${institution.shortName}`, amount, tone: 'neutral' });
  }

  /** Last semester done: graduate, take a carry-over semester, or be withdrawn. Returns true on graduation. */
  private finish(ctx: SimulationContext, resolved: ResolvedEnrolment): boolean {
    const { enrolment, institution, course } = resolved;
    const cgpa = enrolment.cgpa ?? 0;
    const degreeClass = degreeClassFor(cgpa, course.credential);
    if (degreeClass) {
      enrolment.status = 'graduated';
      enrolment.graduatedAt = ctx.time;
      enrolment.endedAt = ctx.time;
      enrolment.degreeClass = degreeClass;
      enrolment.feesDue = 0;
      this.invalidateRoutine(ctx);
      const label = DEGREE_CLASS_LABELS[degreeClass].long;
      ctx.notify({
        kind: 'achievement',
        title: 'You don graduate! 🎓',
        body: `${courseTitle(course)}, ${label} (CGPA ${cgpa.toFixed(2)}) from ${institution.name}. Mummy is already planning the thanksgiving service.${course.afterGraduation ? ` ${course.afterGraduation}` : ''}`,
        tone: 'good',
      });
      ctx.report({ label: `Graduated: ${courseTitle(course)} (${label})`, tone: 'good' });
      addMoodModifier(ctx, 'graduated', 'Just graduated', 15, 14);
      return true;
    }
    if (enrolment.extraSemesters < MAX_EXTRA_SEMESTERS) {
      enrolment.extraSemesters += 1;
      enrolment.semester = enrolment.semester === 1 ? 2 : 1;
      this.chargeFees(ctx, resolved, Math.round(this.sessionFeesNow(ctx, institution, course) / 2), 'Extra semester (carry-overs) 😬');
      return false;
    }
    enrolment.status = 'withdrawn';
    enrolment.endedAt = ctx.time;
    enrolment.feesDue = 0;
    this.invalidateRoutine(ctx);
    ctx.notify({
      kind: 'education',
      title: 'Withdrawn for poor performance',
      body: `${institution.shortName} has asked you to withdraw from ${course.name}. It hurts — but JAMB and the polytechnics are still there, and so are the hustles.`,
      tone: 'bad',
    });
    return false;
  }

  private enforceFees(ctx: SimulationContext, resolved: ResolvedEnrolment): void {
    const { enrolment, institution } = resolved;
    if (enrolment.status !== 'active' || enrolment.feesDue <= 0 || enrolment.feesDueAt === null) return;
    if (ctx.time < enrolment.feesDueAt + FEES_GRACE_DAYS * MINUTES_PER_DAY) return;
    enrolment.status = 'suspended';
    enrolment.suspendedAt = ctx.time;
    this.invalidateRoutine(ctx);
    ctx.notify({
      kind: 'education',
      title: 'Suspended for unpaid fees',
      body: `${institution.shortName} has suspended you until you pay ${formatNaira(enrolment.feesDue)}. Pay from the School app to resume.`,
      tone: 'bad',
    });
    ctx.report({ label: `Suspended at ${institution.shortName} (unpaid fees)`, amount: enrolment.feesDue, tone: 'bad' });
  }

  /** Routine and residence depend on enrolment state. */
  private invalidateRoutine(ctx: SimulationContext): void {
    ctx.invalidate('schedule');
    ctx.invalidate('residence');
  }
}
