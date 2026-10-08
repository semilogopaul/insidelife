import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { BlockedPlayerDto, PlayerReportDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { HandleDto } from './dto/handle.dto.js';
import { ReportPlayerDto } from './dto/report.dto.js';
import { ModerationService } from './moderation.service.js';
import { SocialViewer } from './social-viewer.service.js';

@Controller({ path: 'blocks', version: '1' })
export class BlocksController {
  constructor(
    private readonly session: CharacterSession,
    private readonly moderation: ModerationService,
    private readonly viewer: SocialViewer,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<BlockedPlayerDto[]> {
    return this.moderation.blocked((await this.viewer.of(user)).id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  block(@CurrentUser() user: AuthUser, @Body() body: HandleDto): Promise<BlockedPlayerDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.moderation.block(ctx, body.handle), { touch: true });
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':characterId')
  async unblock(@CurrentUser() user: AuthUser, @Param('characterId', new ParseUUIDPipe()) characterId: string): Promise<void> {
    await this.session.run({ userId: user.userId }, (ctx) => this.moderation.unblock(ctx, characterId), { touch: true });
  }
}

@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly moderation: ModerationService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  report(@CurrentUser() user: AuthUser, @Body() body: ReportPlayerDto): Promise<PlayerReportDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.moderation.report(ctx, body), { touch: true });
  }
}
