import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  PROGRAMMES,
  SKILL_LABELS,
  applySkillXp,
  certificationLabel,
  findCourse,
  findProgramme,
  findVenue,
  formatDate,
  formatNaira,
  type Eligibility,
  type ProgrammeDefinition,
  type ProgrammeEnrolmentDto,
  type ProgrammeOptionDto,
  type ProgrammeRequirement,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import type { ScheduleBlock, Segment } from '../../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { LECTURE_PRIORITY, addMoodModifier, dayWindow, isWorkingDay } from '../education.helpers.js';
import { ieltsBand, programmePassChance } from '../education.rules.js';
import { ProgrammeEnrolmentEntity } from '../entities/programme-enrolment.entity.js';
import { CertificationsService } from './certifications.service.js';
import { EDUCATION_MEMO, EducationStore } from './education-store.service.js';
import { WaecJambService } from './waec-jamb.service.js';

/** What programme eligibility depends on, loaded once per request. */
export interface ProgrammeProfile {
  /** Fields of completed bachelor's degrees. */
  readonly degreeFields: readonly string[];
  /** Holds a bachelor's degree or HND. */
  readonly hasDegree: boolean;
  readonly certifications: readonly string[];
  readonly waecCredits: number;
  readonly waecMathsEnglish: boolean;
  readonly skills: Skills;
  readonly activeProgrammeIds: readonly string[];
  /** Weekday lectures already fill the day (scheduled programmes would clash). */
  readonly attendingLectures: boolean;
}

/** Messages for certifications that change a life. */
const PASS_HEADLINES: Readonly<Record<string, string>> = {
  bar: 'Called to the Bar! ⚖️ Barrister & Solicitor of the Supreme Court of Nigeria.',
  ican: 'Chartered Accountant! 📊 ACA after your name.',
  nmcn: 'Licensed nurse! 💉 The cap is yours.',
  bootcamp: 'Bootcamp graduate! 💻 Your GitHub is finally green.',
};

/**
 * Professional programmes: Law School, ICAN levels, nursing and engineering licences, cloud and PMP certifications,
 * tech bootcamps and IELTS. (The MDCN licence comes from the paid House Officer job in careers.) Pay, prepare (study, classes), and sit the final exam when time is up.
 */
@Injectable()
export class ProgrammesService {
  constructor(
    private readonly store: EducationStore,
    private readonly certifications: CertificationsService,
    private readonly exams: WaecJambService,
  ) {}

  async profile(ctx: SimulationContext): Promise<ProgrammeProfile> {
    const graduated = await this.store.graduated(ctx);
    const certifications = await this.certifications.codes(ctx);
    const waec = await this.exams.standing(ctx);
    const active = await this.store.activeProgrammes(ctx);
    const current = await this.store.currentEnrolment(ctx);
    const courses = graduated.map((degree) => findCourse(degree.courseId)).filter((course) => course !== undefined);
    return {
      degreeFields: courses.filter((course) => course.credential === 'bachelors').map((course) => course.field),
      hasDegree: courses.some((course) => course.credential === 'bachelors' || course.credential === 'hnd'),
      certifications,
      waecCredits: waec.credits,
      waecMathsEnglish: waec.hasMaths && waec.hasEnglish,
      skills: ctx.character.skills,
      activeProgrammeIds: active.map((programme) => programme.programmeId),
      attendingLectures: current?.status === 'active',
    };
  }

  eligibility(profile: ProgrammeProfile, programme: ProgrammeDefinition): Eligibility {
    if (profile.activeProgrammeIds.includes(programme.id)) return { eligible: false, reason: 'You’re already enrolled' };
    if (!programme.scored && profile.certifications.includes(programme.grants)) return { eligible: false, reason: 'You already hold this' };
    if (programme.schedule && profile.attendingLectures) return { eligible: false, reason: 'Classes clash with your lectures' };
    if (programme.requires.length === 0) return { eligible: true, reason: null };
    const reasons = programme.requires.map((requirement) => this.unmet(profile, requirement));
    if (reasons.some((reason) => reason === null)) return { eligible: true, reason: null };
    return { eligible: false, reason: reasons[0] ?? 'Requirements not met' };
  }

  async options(ctx: SimulationContext): Promise<ProgrammeOptionDto[]> {
    const profile = await this.profile(ctx);
    return PROGRAMMES.map((programme) => ({
      id: programme.id,
      name: programme.name,
      provider: programme.provider,
      blurb: programme.blurb,
      cost: ctx.world.price(programme.cost, ctx.time),
      durationDays: programme.durationDays,
      grants: programme.grants,
      grantsLabel: certificationLabel(programme.grants),
      ...this.eligibility(profile, programme),
    }));
  }

  async enrol(ctx: SimulationContext, programmeId: string): Promise<ProgrammeEnrolmentEntity> {
    const programme = findProgramme(programmeId);
    if (!programme) throw new ResourceNotFoundException('Programme');
    const eligibility = this.eligibility(await this.profile(ctx), programme);
    if (!eligibility.eligible) throw new GameRuleException('NOT_ELIGIBLE', eligibility.reason ?? 'You don’t meet the requirements yet');

    const id = randomUUID();
    const fee = ctx.world.price(programme.cost, ctx.time);
    await ctx.wallet.pay(fee, 'school-fees', programme.name, `programme:${id}`);
    const enrolment = ctx.manager.create(ProgrammeEnrolmentEntity, {
      id,
      characterId: ctx.character.id,
      programmeId: programme.id,
      status: 'active',
      feePaid: fee,
      startedAt: ctx.time,
      endsAt: ctx.time + programme.durationDays * MINUTES_PER_DAY,
      prepHours: 0,
      classMinutesScheduled: 0,
      classMinutesAttended: 0,
      score: null,
      completedAt: null,
    });
    await this.store.insert(ctx, EDUCATION_MEMO.programmes, enrolment);
    if (programme.schedule) ctx.invalidate('schedule');
    const venue = programme.schedule ? findVenue(programme.schedule.venueId) : undefined;
    ctx.notify({
      kind: 'education',
      title: `Enrolled: ${programme.name}`,
      body: `${formatNaira(fee)} paid. ${venue ? `Classes weekdays at ${venue.name}. ` : ''}The final exam is on ${formatDate(enrolment.endsAt)} — study to improve your chances.`,
      tone: 'good',
    });
    return enrolment;
  }

  /** Weekday class blocks for scheduled programmes (bootcamps). */
  async classBlocks(ctx: SimulationContext, dayIndex: number): Promise<ScheduleBlock[]> {
    const blocks: ScheduleBlock[] = [];
    for (const enrolment of await this.store.activeProgrammes(ctx)) {
      const schedule = findProgramme(enrolment.programmeId)?.schedule;
      if (!schedule) continue;
      const window = dayWindow(dayIndex, schedule.startHour, schedule.endHour);
      if (window.startsAt < enrolment.startedAt || window.startsAt >= enrolment.endsAt || !isWorkingDay(ctx, window.startsAt)) continue;
      blocks.push({
        kind: 'lecture',
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        locationId: schedule.venueId,
        label: `${findProgramme(enrolment.programmeId)?.name ?? 'Programme'} class`,
        priority: LECTURE_PRIORITY,
        commute: true,
      });
    }
    return blocks;
  }

  /** Class attendance counts as preparation. */
  async recordSegment(ctx: SimulationContext, segment: Segment): Promise<void> {
    if (segment.kind !== 'lecture') return;
    for (const enrolment of await this.store.activeProgrammes(ctx)) {
      if (findProgramme(enrolment.programmeId)?.schedule?.venueId !== segment.locationId) continue;
      const minutes = segment.endsAt - segment.startsAt;
      enrolment.classMinutesAttended += minutes;
      enrolment.prepHours += minutes / MINUTES_PER_HOUR;
      await this.store.save(ctx, enrolment);
    }
  }

  /** Active programmes an action prepares for. */
  async preparing(ctx: SimulationContext, actionId: string): Promise<ProgrammeEnrolmentEntity[]> {
    return (await this.store.activeProgrammes(ctx)).filter((enrolment) => findProgramme(enrolment.programmeId)?.prepActions.includes(actionId));
  }

  async addPrep(ctx: SimulationContext, enrolment: ProgrammeEnrolmentEntity, hours: number): Promise<void> {
    enrolment.prepHours = Math.round((enrolment.prepHours + hours) * 100) / 100;
    await this.store.save(ctx, enrolment);
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const scheduledToday = new Set((await this.classBlocks(ctx, dayIndex)).map((block) => block.locationId));
    for (const enrolment of await this.store.activeProgrammes(ctx)) {
      const programme = findProgramme(enrolment.programmeId);
      if (!programme) continue;
      if (programme.schedule && scheduledToday.has(programme.schedule.venueId)) {
        enrolment.classMinutesScheduled += (programme.schedule.endHour - programme.schedule.startHour) * MINUTES_PER_HOUR;
      }
      if (ctx.time >= enrolment.endsAt) await this.sitFinal(ctx, enrolment, programme);
      else await this.store.save(ctx, enrolment);
    }
  }

  async toDtos(ctx: SimulationContext): Promise<ProgrammeEnrolmentDto[]> {
    return (await this.store.programmes(ctx)).map((enrolment) => {
      const programme = findProgramme(enrolment.programmeId);
      const span = enrolment.endsAt - enrolment.startedAt;
      return {
        id: enrolment.id,
        programmeId: enrolment.programmeId,
        name: programme?.name ?? enrolment.programmeId,
        status: enrolment.status,
        startedAt: enrolment.startedAt,
        endsAt: enrolment.endsAt,
        prepHours: Math.round(enrolment.prepHours * 10) / 10,
        progressPercent: enrolment.status === 'active' && span > 0 ? Math.min(100, Math.round(((ctx.time - enrolment.startedAt) / span) * 100)) : 100,
        score: enrolment.score,
      };
    });
  }

  // --- internals -------------------------------------------------------------------------------------------------

  private unmet(profile: ProgrammeProfile, requirement: ProgrammeRequirement): string | null {
    if (requirement.degreeFields && !requirement.degreeFields.some((field) => profile.degreeFields.includes(field))) {
      return `Needs a degree in ${requirement.degreeFields.map((field) => field.replace(/-/g, ' ')).join(' or ')}`;
    }
    if (requirement.anyDegree && !profile.hasDegree) return 'Needs a university degree or HND';
    if (requirement.certification && !profile.certifications.includes(requirement.certification)) {
      return `Needs ${certificationLabel(requirement.certification)} first`;
    }
    if (requirement.waecCredits !== undefined && (profile.waecCredits < requirement.waecCredits || !profile.waecMathsEnglish)) {
      return `Needs ${requirement.waecCredits} WAEC credits incl. English and Maths`;
    }
    for (const [skill, minimum] of Object.entries(requirement.minSkill ?? {}) as Array<[SkillKey, number]>) {
      if (profile.skills[skill] < minimum) return `Needs ${SKILL_LABELS[skill]} skill ${minimum}+`;
    }
    return null;
  }

  private async sitFinal(ctx: SimulationContext, enrolment: ProgrammeEnrolmentEntity, programme: ProgrammeDefinition): Promise<void> {
    const attempt = (await this.store.programmes(ctx)).filter((candidate) => candidate.programmeId === programme.id && candidate.startedAt <= enrolment.startedAt).length;
    const rng = ctx.rng('programme', programme.id, attempt);
    const skills = ctx.character.skills;
    enrolment.completedAt = ctx.time;

    let passed: boolean;
    if (programme.scored) {
      enrolment.score = ieltsBand(rng, { intellect: skills.intellect, charisma: skills.charisma, prepHours: enrolment.prepHours });
      passed = true;
    } else {
      const attendance = enrolment.classMinutesScheduled > 0 ? Math.min(1, enrolment.classMinutesAttended / enrolment.classMinutesScheduled) : 1;
      const chance = programmePassChance(skills[programme.skill], enrolment.prepHours, programme.prepHoursTarget) * (programme.schedule ? 0.5 + 0.5 * attendance : 1);
      passed = rng.chance(chance);
    }
    enrolment.status = passed ? 'passed' : 'failed';
    await this.store.save(ctx, enrolment);

    if (!passed) {
      addMoodModifier(ctx, `failed-${programme.id}`, `Failed ${programme.name}`, -10, 5);
      ctx.notify({
        kind: 'education',
        title: `${programme.name}: not this time`,
        body: 'You didn’t make the pass mark. Many greats failed once — re-register and read harder.',
        tone: 'bad',
      });
      ctx.report({ label: `Failed ${programme.name}`, tone: 'bad' });
      return;
    }

    await this.certifications.grant(ctx, programme.grants, programme.id, enrolment.score);
    const grown: Record<SkillKey, number> = { ...skills };
    for (const [skill, xp] of Object.entries(programme.skillXpOnPass ?? {}) as Array<[SkillKey, number]>) grown[skill] = applySkillXp(grown[skill], xp);
    ctx.character.skills = grown as Skills;
    addMoodModifier(ctx, `passed-${programme.id}`, `Passed ${programme.name}`, 10, 7);
    ctx.notify({
      kind: 'achievement',
      title: programme.scored ? `IELTS band ${enrolment.score?.toFixed(1)} 🌍` : (PASS_HEADLINES[programme.grants] ?? `Passed: ${programme.name} ✅`),
      body: programme.scored
        ? 'Your IELTS result is valid for visa applications. Japa plans loading…'
        : `${certificationLabel(programme.grants)} added to your credentials.`,
      tone: 'good',
    });
    ctx.report({ label: `${certificationLabel(programme.grants)} earned`, tone: 'good' });
  }
}
