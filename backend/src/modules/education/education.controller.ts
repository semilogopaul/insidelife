import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { EducationOverviewDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { ApplyForAdmissionDto } from './dto/apply-admission.dto.js';
import { ProgrammeParamsDto } from './dto/programme-params.dto.js';
import { RegisterExamDto } from './dto/register-exam.dto.js';
import { AdmissionsService } from './services/admissions.service.js';
import { EnrolmentService } from './services/enrolment.service.js';
import { NyscService } from './services/nysc.service.js';
import { EducationOverviewService } from './services/overview.service.js';
import { ProgrammesService } from './services/programmes.service.js';
import { WaecJambService } from './services/waec-jamb.service.js';

const COMMAND_THROTTLE = { default: { limit: 20, ttl: 60_000 } } as const;

/** The School app: WAEC/JAMB, admissions, enrolment and fees, NYSC and professional programmes. */
@Controller({ path: 'education', version: '1' })
export class EducationController {
  constructor(
    private readonly session: CharacterSession,
    private readonly overview: EducationOverviewService,
    private readonly exams: WaecJambService,
    private readonly admissions: AdmissionsService,
    private readonly enrolments: EnrolmentService,
    private readonly nysc: NyscService,
    private readonly programmes: ProgrammesService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<EducationOverviewDto> {
    return this.run(user, async () => undefined);
  }

  /** Register (and pay) for JAMB or WAEC GCE — in person at a CBT centre. */
  @Throttle(COMMAND_THROTTLE)
  @Post('exams')
  registerExam(@CurrentUser() user: AuthUser, @Body() body: RegisterExamDto): Promise<EducationOverviewDto> {
    return this.run(user, (ctx) => this.exams.register(ctx, body.kind, body.institutionId, body.courseId));
  }

  /** Walk into the exam hall: starts the 3-hour `write-exam` action. */
  @Throttle(COMMAND_THROTTLE)
  @Post('exams/:id/sittings')
  sitExam(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<EducationOverviewDto> {
    return this.run(user, (ctx) => this.exams.startSitting(ctx, id));
  }

  @Throttle(COMMAND_THROTTLE)
  @Post('applications')
  apply(@CurrentUser() user: AuthUser, @Body() body: ApplyForAdmissionDto): Promise<EducationOverviewDto> {
    return this.run(user, (ctx) => this.admissions.apply(ctx, body.institutionId, body.courseId));
  }

  @Throttle(COMMAND_THROTTLE)
  @Post('applications/:id/acceptance')
  accept(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<EducationOverviewDto> {
    return this.run(user, (ctx) => this.admissions.accept(ctx, id));
  }

  @Throttle(COMMAND_THROTTLE)
  @Post('enrolments/current/fees')
  payFees(@CurrentUser() user: AuthUser): Promise<EducationOverviewDto> {
    return this.run(user, (ctx) => this.enrolments.payFees(ctx));
  }

  @Throttle(COMMAND_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Delete('enrolments/current')
  dropOut(@CurrentUser() user: AuthUser): Promise<EducationOverviewDto> {
    return this.run(user, (ctx) => this.enrolments.dropOut(ctx));
  }

  @Throttle(COMMAND_THROTTLE)
  @Post('nysc')
  registerNysc(@CurrentUser() user: AuthUser): Promise<EducationOverviewDto> {
    return this.run(user, (ctx) => this.nysc.register(ctx));
  }

  @Throttle(COMMAND_THROTTLE)
  @Post('programmes/:id/enrolments')
  enrolProgramme(@CurrentUser() user: AuthUser, @Param() params: ProgrammeParamsDto): Promise<EducationOverviewDto> {
    return this.run(user, (ctx) => this.programmes.enrol(ctx, params.id));
  }

  /** Every route: lock + settle the character, apply the command, answer with the fresh School overview. */
  private run(user: AuthUser, command: (ctx: SimulationContext) => Promise<unknown>): Promise<EducationOverviewDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        await command(ctx);
        return this.overview.overview(ctx);
      },
      { touch: true },
    );
  }
}
