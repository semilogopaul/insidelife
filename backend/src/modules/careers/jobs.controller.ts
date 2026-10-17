import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { JobApplicationDto, JobBoardDto, JobDetailDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { ApplicationsService } from './applications.service.js';
import { JobBoardQueryDto, JobParamsDto } from './dto/careers.dto.js';
import { JobBoardService } from './job-board.service.js';

/** The Jobs app: board, job details and applications. */
@Controller({ path: 'jobs', version: '1' })
export class JobsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly board: JobBoardService,
    private readonly applications: ApplicationsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: JobBoardQueryDto): Promise<JobBoardDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.board.board(ctx, query.cityId));
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param() params: JobParamsDto): Promise<JobDetailDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.board.detail(ctx, params.id));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/applications')
  apply(@CurrentUser() user: AuthUser, @Param() params: JobParamsDto): Promise<JobApplicationDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.applications.apply(ctx, params.id), { touch: true });
  }
}
