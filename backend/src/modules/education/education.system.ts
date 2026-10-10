import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  actionHours,
  HOSTEL_LIVING_COST_MULTIPLIER,
  findCourse,
  findInstitution,
  type ActionDefinition,
  type DegreeClassId,
  type GameMinute,
} from '@insidelife/shared';
import type { ActivityState } from '../characters/entities/character.entity.js';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import type { Residence, ScheduleBlock, Segment, SimulationSystem, SummaryContribution } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { educationEvents } from './education.events.js';
import { AdmissionsService } from './services/admissions.service.js';
import { CertificationsService } from './services/certifications.service.js';
import { EducationStore } from './services/education-store.service.js';
import { EnrolmentService } from './services/enrolment.service.js';
import { NyscService } from './services/nysc.service.js';
import { EducationOverviewService } from './services/overview.service.js';
import { ProgrammesService } from './services/programmes.service.js';
import { WaecJambService } from './services/waec-jamb.service.js';

/** Clout from qualifications (status points). */
const CREDENTIAL_STATUS: Readonly<Record<'bachelors' | 'hnd' | 'nd', number>> = { bachelors: 40, hnd: 25, nd: 15 };
const CLASS_STATUS: Readonly<Record<DegreeClassId, number>> = {
  first: 40,
  'second-upper': 20,
  'second-lower': 8,
  third: 0,
  pass: 0,
  distinction: 25,
  'upper-credit': 12,
  'lower-credit': 4,
};
const CERTIFICATION_STATUS: Readonly<Record<string, number>> = { bar: 40, mdcn: 45, ican: 35, coren: 25, nmcn: 20, cloud: 15, pmp: 15, bootcamp: 8, ielts: 5 };

/**
 * Plugs the education pipeline into the simulation: WAEC at birth, lectures/PPA/classes on the routine, hostel
 * residence, attendance from segments, study and exam completion, nightly results, admissions, semesters, fees,
 * graduation, NYSC allowance and professional exams.
 */
@Injectable()
export class EducationSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'education';
  readonly order = 100;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly lifeEvents: LifeEventsRegistry,
    private readonly store: EducationStore,
    private readonly exams: WaecJambService,
    private readonly admissions: AdmissionsService,
    private readonly enrolments: EnrolmentService,
    private readonly nysc: NyscService,
    private readonly programmes: ProgrammesService,
    private readonly certifications: CertificationsService,
    private readonly overview: EducationOverviewService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.lifeEvents.register(...educationEvents({ enrolments: this.enrolments, exams: this.exams }));
  }

  async onCharacterCreated(ctx: SimulationContext): Promise<void> {
    await this.exams.ensureSchoolWaec(ctx);
    const standing = await this.exams.standing(ctx);
    const ready = standing.credits >= 5 && standing.hasMaths && standing.hasEnglish;
    ctx.notify({
      kind: 'education',
      title: `WAEC result: ${standing.credits} credits`,
      body: ready
        ? 'Five credits including Maths and English — you’re ready for JAMB. Head to a CBT centre to register.'
        : `You need five credits including Maths and English for university${standing.hasMaths && standing.hasEnglish ? '' : ' (Maths or English let you down)'}. Register for WAEC GCE at a CBT centre and try again.`,
      tone: ready ? 'good' : 'neutral',
    });
  }

  async scheduleForDay(ctx: SimulationContext, dayIndex: number): Promise<readonly ScheduleBlock[]> {
    const blocks: ScheduleBlock[] = [];
    const lecture = await this.enrolments.lectureBlock(ctx, dayIndex);
    if (lecture) blocks.push(lecture);
    const ppa = await this.nysc.ppaBlock(ctx, dayIndex);
    if (ppa) blocks.push(ppa);
    blocks.push(...(await this.programmes.classBlocks(ctx, dayIndex)));
    return blocks;
  }

  residence(ctx: SimulationContext, t: GameMinute): Promise<Residence | null> {
    return this.enrolments.residence(ctx, t);
  }

  async livingCostMultiplier(ctx: SimulationContext): Promise<number> {
    return (await this.enrolments.residence(ctx, ctx.time)) ? HOSTEL_LIVING_COST_MULTIPLIER : 1;
  }

  async onSegment(ctx: SimulationContext, segment: Segment): Promise<void> {
    if (segment.kind === 'lecture') {
      await this.enrolments.recordSegment(ctx, segment);
      await this.programmes.recordSegment(ctx, segment);
    } else if (segment.kind === 'work') {
      await this.nysc.recordSegment(ctx, segment);
    }
  }

  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (action.id === 'write-exam') {
      await this.exams.completeSitting(ctx, activity);
      return;
    }
    await this.distributeStudy(ctx, action, activity);
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    await this.exams.releaseDue(ctx);
    await this.admissions.onDayEnd(ctx);
    const graduated = await this.enrolments.onDayEnd(ctx, dayIndex);
    if (graduated) await this.nysc.onGraduated(ctx, graduated.enrolment);
    await this.nysc.onDayEnd(ctx, dayIndex);
    await this.programmes.onDayEnd(ctx, dayIndex);
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    await this.nysc.onMonthEnd(ctx, monthIndex);
  }

  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    return { education: await this.overview.summary(ctx) };
  }

  async status(ctx: SimulationContext): Promise<number> {
    let status = 0;
    for (const degree of await this.store.graduated(ctx)) {
      const course = findCourse(degree.courseId);
      if (!course) continue;
      status += CREDENTIAL_STATUS[course.credential] + (degree.degreeClass ? CLASS_STATUS[degree.degreeClass] : 0);
      status += Math.round((findInstitution(degree.institutionId)?.prestige ?? 0) / 5);
    }
    const current = await this.enrolments.current(ctx);
    if (current && current.enrolment.status === 'active') status += Math.round(current.institution.prestige / 10);
    if ((await this.store.nysc(ctx))?.status === 'completed') status += 5;
    for (const code of await this.certifications.codes(ctx)) status += CERTIFICATION_STATUS[code] ?? 0;
    return status;
  }

  /**
   * A finished study session prepares for everything it applies to — exam prep, course mastery, programme prep —
   * split evenly so stacking commitments never multiplies the hours.
   */
  private async distributeStudy(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    const studies = action.hooks?.includes('study') ?? false;
    const pendingExams = studies ? await this.exams.pending(ctx) : [];
    const current = studies ? await this.enrolments.current(ctx) : null;
    const enrolled = current && current.enrolment.status === 'active' && ctx.time >= current.enrolment.startsAt ? current : null;
    const programmes = await this.programmes.preparing(ctx, action.id);
    const targets = pendingExams.length + (enrolled ? 1 : 0) + programmes.length;
    if (targets === 0) return;

    const hours = actionHours(activity) / targets;
    for (const exam of pendingExams) await this.exams.addPrep(ctx, exam, hours);
    if (enrolled) await this.enrolments.addStudy(ctx, enrolled, hours, activity.locationId === enrolled.institution.venueId);
    for (const programme of programmes) await this.programmes.addPrep(ctx, programme, hours);
  }
}
