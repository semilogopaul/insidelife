import { Inject, Injectable } from '@nestjs/common';
import {
  MINUTES_PER_DAY,
  PILOT_TRAINING,
  checkRidePassChance,
  findAction,
  isInterruptibleActivity,
  type ActionDefinition,
  type PilotTrainingDto,
  type PilotTrainingStepResultDto,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import { CREDENTIALS_PORT, type CredentialsPort } from '../../common/ports/credentials.port.js';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { PilotTrainingEntity } from './entities/pilot-training.entity.js';

const LICENCE_MEMO = 'aviation-ppl';
const TRAINING_MEMO = 'aviation-training';
/** Extra lessons beyond the required ones still help the check-ride; stop charging for them after this many. */
const MAX_EXTRA_LESSONS = 6;
export const TRAINING_ROWS: RowProbe = { key: 'aviation:training', table: 'pilot_training', where: 'character_id = $1' };

/**
 * The Private Pilot Licence: enrol at the GAT flight school (fee), take lessons there (one a day, each a timed
 * action) and fly the check-ride; passing grants the `ppl` certification through the education domain
 * (`CredentialsPort`). A failed check-ride costs the fee and two lessons of rust.
 */
@Injectable()
export class PilotTrainingService {
  constructor(
    @Inject(CREDENTIALS_PORT) private readonly credentials: CredentialsPort,
    private readonly engine: SimulationEngine,
  ) {}

  async held(ctx: SimulationContext): Promise<boolean> {
    return ctx.memo(LICENCE_MEMO, async () => (await this.credentials.credentials(ctx)).certifications.includes(PILOT_TRAINING.certification));
  }

  private async row(ctx: SimulationContext): Promise<PilotTrainingEntity | null> {
    return ctx.memo(TRAINING_MEMO, async () => {
      if (!(await ctx.mayHaveRows(TRAINING_ROWS))) return null;
      return ctx.manager.findOne(PilotTrainingEntity, { where: { characterId: ctx.character.id } });
    });
  }

  private day(ctx: SimulationContext): number {
    return Math.floor(ctx.time / MINUTES_PER_DAY);
  }

  private atSchool(ctx: SimulationContext): boolean {
    return !ctx.character.travel && ctx.character.locationId === PILOT_TRAINING.venueId;
  }

  async status(ctx: SimulationContext): Promise<PilotTrainingDto> {
    const row = await this.row(ctx);
    const activity = ctx.character.activity;
    const running = activity && activity.endsAt > ctx.time ? activity : null;
    const inProgress = running?.actionId === PILOT_TRAINING.lessonActionId ? 'lesson' : running?.actionId === PILOT_TRAINING.checkRideActionId ? 'check-ride' : null;
    const today = this.day(ctx);
    return {
      licence: await this.held(ctx),
      enrolled: row !== null,
      lessons: row?.lessons ?? 0,
      lessonsRequired: PILOT_TRAINING.lessonsRequired,
      checkRideAttempts: row?.checkRides ?? 0,
      enrolFee: ctx.world.price(PILOT_TRAINING.enrolFee, ctx.time),
      lessonFee: ctx.world.price(PILOT_TRAINING.lessonFee, ctx.time),
      checkRideFee: ctx.world.price(PILOT_TRAINING.checkRideFee, ctx.time),
      nextLessonAt: row !== null && row.lastLessonDay === today ? (today + 1) * MINUTES_PER_DAY : null,
      inProgress,
      endsAt: inProgress ? running!.endsAt : null,
      atSchool: this.atSchool(ctx),
      schoolVenueId: PILOT_TRAINING.venueId,
      minAge: PILOT_TRAINING.minAge,
    };
  }

  async enrol(ctx: SimulationContext): Promise<PilotTrainingStepResultDto> {
    this.assertCanStudy(ctx);
    if (await this.held(ctx)) throw new GameRuleException('ALREADY_LICENSED', 'You already hold your Private Pilot Licence');
    if (ctx.age < PILOT_TRAINING.minAge) throw new GameRuleException('TOO_YOUNG', `Flight school takes students from ${PILOT_TRAINING.minAge}`);
    if (await this.row(ctx)) throw new GameRuleException('ALREADY_ENROLLED', 'You’re already enrolled. Book your next lesson');
    this.assertAtSchool(ctx);
    const fee = ctx.world.price(PILOT_TRAINING.enrolFee, ctx.time);
    await ctx.wallet.pay(fee, 'school-fees', 'Flight school enrolment (PPL)', 'ppl-enrol', { sink: 'fees' });
    await ctx.manager.save(ctx.manager.create(PilotTrainingEntity, { characterId: ctx.character.id, enrolledAt: ctx.time, lessons: 0, lastLessonDay: null, checkRides: 0 }));
    ctx.invalidate(TRAINING_MEMO);
    ctx.notify({ kind: 'achievement', title: 'Enrolled at flight school 🛩️', body: `Book a lesson each day. You need ${PILOT_TRAINING.lessonsRequired} before the check-ride.`, tone: 'good' });
    return { training: await this.status(ctx), fee, balance: ctx.wallet.cash };
  }

  async startLesson(ctx: SimulationContext): Promise<PilotTrainingStepResultDto> {
    this.assertCanStudy(ctx);
    if (await this.held(ctx)) throw new GameRuleException('ALREADY_LICENSED', 'You already hold your Private Pilot Licence');
    const row = await this.row(ctx);
    if (!row) throw new GameRuleException('NOT_ENROLLED', 'Enrol at the flight school first');
    if (row.lessons >= PILOT_TRAINING.lessonsRequired + MAX_EXTRA_LESSONS) {
      throw new GameRuleException('ENOUGH_LESSONS', 'Your instructor says you’re ready. Book the check-ride');
    }
    this.assertAtSchool(ctx);
    const today = this.day(ctx);
    if (row.lastLessonDay === today) throw new GameRuleException('ONE_A_DAY', 'One lesson a day. Come back tomorrow');
    const fee = ctx.world.price(PILOT_TRAINING.lessonFee, ctx.time);
    await ctx.wallet.pay(fee, 'school-fees', `Flight lesson ${row.lessons + 1}`, `ppl-lesson:${today}`, { sink: 'fees', refuseRepeat: 'Your instructor is still briefing you' });
    row.lastLessonDay = today;
    await ctx.manager.save(row);
    this.engine.start(ctx, {
      actionId: PILOT_TRAINING.lessonActionId,
      startedAt: ctx.time,
      endsAt: ctx.time + PILOT_TRAINING.lessonMinutes,
      locationId: ctx.character.locationId,
      cost: fee,
    });
    return { training: await this.status(ctx), fee, balance: ctx.wallet.cash };
  }

  async startCheckRide(ctx: SimulationContext): Promise<PilotTrainingStepResultDto> {
    this.assertCanStudy(ctx);
    if (await this.held(ctx)) throw new GameRuleException('ALREADY_LICENSED', 'You already hold your Private Pilot Licence');
    const row = await this.row(ctx);
    if (!row) throw new GameRuleException('NOT_ENROLLED', 'Enrol at the flight school first');
    if (row.lessons < PILOT_TRAINING.lessonsRequired) {
      throw new GameRuleException('NOT_READY', `The examiner wants ${PILOT_TRAINING.lessonsRequired} lessons first (you have ${row.lessons})`);
    }
    this.assertAtSchool(ctx);
    const fee = ctx.world.price(PILOT_TRAINING.checkRideFee, ctx.time);
    await ctx.wallet.pay(fee, 'school-fees', `PPL check-ride, attempt ${row.checkRides + 1}`, `ppl-checkride:${row.checkRides}`, { sink: 'fees' });
    row.checkRides += 1;
    await ctx.manager.save(row);
    this.engine.start(ctx, {
      actionId: PILOT_TRAINING.checkRideActionId,
      startedAt: ctx.time,
      endsAt: ctx.time + PILOT_TRAINING.checkRideMinutes,
      locationId: ctx.character.locationId,
      cost: fee,
    });
    return { training: await this.status(ctx), fee, balance: ctx.wallet.cash };
  }

  /** A lesson or the check-ride finished (the simulation system routes the action here). */
  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (action.id === PILOT_TRAINING.lessonActionId) await this.lessonDone(ctx);
    else if (action.id === PILOT_TRAINING.checkRideActionId) await this.checkRideDone(ctx, activity);
  }

  private async lessonDone(ctx: SimulationContext): Promise<void> {
    const row = await this.row(ctx);
    if (!row) return;
    row.lessons += 1;
    await ctx.manager.save(row);
    ctx.report({ label: `Flight lesson ${row.lessons} of ${PILOT_TRAINING.lessonsRequired}`, tone: 'good' });
    if (row.lessons === PILOT_TRAINING.lessonsRequired) {
      ctx.notify({ kind: 'achievement', title: 'Ready for the check-ride 🛩️', body: 'Your instructor signed your logbook. Book the PPL check-ride at the flight school.', tone: 'good' });
    }
  }

  private async checkRideDone(ctx: SimulationContext, activity: ActivityState): Promise<void> {
    const row = await this.row(ctx);
    if (!row || (await this.held(ctx))) return;
    const chance = checkRidePassChance({
      intellect: ctx.character.skills.intellect,
      hustle: ctx.character.skills.hustle,
      mood: this.engine.mood(ctx),
      extraLessons: Math.max(0, row.lessons - PILOT_TRAINING.lessonsRequired),
    });
    // Seeded by when it started and the attempt, so it can never be re-rolled.
    if (!ctx.rng('ppl-check-ride', activity.startedAt, row.checkRides).chance(chance)) {
      row.lessons = Math.max(0, row.lessons - 2);
      await ctx.manager.save(row);
      ctx.notify({
        kind: 'achievement',
        title: 'Check-ride failed 😩',
        body: '“Your landing was a little… enthusiastic.” Two more lessons, then another go. The fee is non-refundable.',
        tone: 'bad',
      });
      return;
    }
    await this.credentials.grantCertification(ctx, PILOT_TRAINING.certification);
    ctx.invalidate(LICENCE_MEMO);
    ctx.notify({ kind: 'achievement', title: 'Pilot’s licence! 🛫', body: 'You passed. Your Private Pilot Licence lets you fly piston planes and turboprops yourself.', tone: 'good' });
    ctx.report({ label: 'Passed the PPL check-ride', tone: 'good' });
  }

  private assertCanStudy(ctx: SimulationContext): void {
    const { character } = ctx;
    if (!character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    if (character.travel) throw new GameRuleException('TRAVELLING', 'You’re on the move. Get to the flight school first');
    if (character.activity && !isInterruptibleActivity(character.activity)) {
      const current = findAction(character.activity.actionId);
      throw new GameRuleException('BUSY', `You’re busy (${current?.verb.toLowerCase() ?? 'doing something'}). Finish that first`);
    }
  }

  private assertAtSchool(ctx: SimulationContext): void {
    if (!this.atSchool(ctx)) throw new GameRuleException('WRONG_PLACE', 'The flight school is at the Lagos General Aviation Terminal. Go there first');
  }
}
