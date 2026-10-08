import { Inject, Injectable } from '@nestjs/common';
import {
  DRIVERS_LICENCE,
  VENUES,
  findAction,
  findVenue,
  isVenueOpen,
  toDateParts,
  type DriverLicenceDto,
  type LicenceApplicationResultDto,
  isInterruptibleActivity,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import { CREDENTIALS_PORT, type CredentialsPort } from '../../common/ports/credentials.port.js';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { drivingTestPassChance } from './rules/vehicle.rules.js';
import { VehiclesService } from './vehicles.service.js';

const LICENCE_MEMO = 'vehicles-licence';
/** FRSC minimum age for a private driver's licence. */
const MIN_LICENCE_AGE = 18;
const TEST_CENTRES = VENUES.filter((venue) => venue.type === DRIVERS_LICENCE.venueType).map((venue) => venue.id);

/**
 * The FRSC driver's licence: pay the fee at a government office, sit the 2-hour `driving-test` system action, and
 * on completion pass or fail (theory, road craft, nerves and practice). The licence itself is a certification
 * held by the education domain (`CredentialsPort`).
 */
@Injectable()
export class LicenceService {
  constructor(
    @Inject(CREDENTIALS_PORT) private readonly credentials: CredentialsPort,
    private readonly engine: SimulationEngine,
    private readonly vehicles: VehiclesService,
  ) {}

  async held(ctx: SimulationContext): Promise<boolean> {
    return ctx.memo(LICENCE_MEMO, async () =>
      (await this.credentials.credentials(ctx)).certifications.includes(DRIVERS_LICENCE.certification),
    );
  }

  async status(ctx: SimulationContext): Promise<DriverLicenceDto> {
    const activity = ctx.character.activity;
    const testing = activity?.actionId === DRIVERS_LICENCE.actionId && activity.endsAt > ctx.time;
    return {
      held: await this.held(ctx),
      testInProgress: testing,
      testEndsAt: testing ? activity.endsAt : null,
      fee: ctx.world.price(DRIVERS_LICENCE.fee, ctx.time),
      testCentres: TEST_CENTRES,
    };
  }

  /** Pay the FRSC fee and start the driving test where the character is standing. */
  async apply(ctx: SimulationContext): Promise<LicenceApplicationResultDto> {
    const character = ctx.character;
    if (!character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    if (await this.held(ctx)) throw new GameRuleException('ALREADY_LICENSED', 'You already have your licence. Drive carefully!');
    if (ctx.age < MIN_LICENCE_AGE) {
      throw new GameRuleException('TOO_YOUNG', `FRSC only licenses drivers from ${MIN_LICENCE_AGE}. Until then, drive at your own risk (and mind the checkpoints)`);
    }
    if (character.travel) throw new GameRuleException('TRAVELLING', 'You’re on the move. Get to the FRSC desk first.');
    if (character.activity && !isInterruptibleActivity(character.activity)) {
      const current = findAction(character.activity.actionId);
      throw new GameRuleException('BUSY', `You’re busy (${current?.verb.toLowerCase() ?? 'doing something'}). Finish that first.`);
    }
    const venue = findVenue(character.locationId);
    if (!venue || venue.type !== DRIVERS_LICENCE.venueType) {
      const names = TEST_CENTRES.map((id) => findVenue(id)?.name ?? id).join(' or ');
      throw new GameRuleException('WRONG_PLACE', `The FRSC desk is at a government office — go to ${names}`);
    }
    if (!isVenueOpen(venue, toDateParts(ctx.time).hour)) {
      throw new GameRuleException('CLOSED', `${venue.name} is closed. Come back during office hours`);
    }

    const fee = ctx.world.price(DRIVERS_LICENCE.fee, ctx.time);
    await ctx.wallet.pay(fee, 'fee', 'FRSC driver’s licence fee', `frsc-licence:${ctx.time}`, { sink: 'fees' });
    this.engine.start(ctx, {
      actionId: DRIVERS_LICENCE.actionId,
      startedAt: ctx.time,
      endsAt: ctx.time + DRIVERS_LICENCE.testMinutes,
      locationId: character.locationId,
      cost: fee,
    });
    return { licence: await this.status(ctx), fee, balance: ctx.wallet.cash };
  }

  /** The driving test finished: roll the result (seeded by when it started, so it can never be re-rolled). */
  async complete(ctx: SimulationContext, activity: ActivityState): Promise<void> {
    if (await this.held(ctx)) return;
    const chance = drivingTestPassChance({
      intellect: ctx.character.skills.intellect,
      hustle: ctx.character.skills.hustle,
      mood: this.engine.mood(ctx),
      ownsCar: (await this.vehicles.drivable(ctx)).length > 0,
    });
    if (!ctx.rng('driving-test', activity.startedAt).chance(chance)) {
      ctx.notify({
        kind: 'achievement',
        title: 'FRSC failed you 😩',
        body: '“You no check your mirror, and you climbed the kerb.” Practise and try again — the fee is non-refundable.',
        tone: 'bad',
      });
      return;
    }
    await this.credentials.grantCertification(ctx, DRIVERS_LICENCE.certification);
    ctx.invalidate(LICENCE_MEMO);
    ctx.notify({
      kind: 'achievement',
      title: 'You passed! 🪪',
      body: 'FRSC has issued your driver’s licence. Police checkpoints just got a lot less scary.',
      tone: 'good',
    });
    ctx.report({ label: 'Passed the FRSC driving test', tone: 'good' });
  }
}
