import { Controller, Get, Param } from '@nestjs/common';
import type { LeaderboardDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { LeaderboardParamsDto } from './dto/players.dto.js';
import { LeaderboardsService } from './leaderboards.service.js';
import { SocialViewer } from './social-viewer.service.js';

@Controller({ path: 'leaderboards', version: '1' })
export class LeaderboardsController {
  constructor(
    private readonly leaderboards: LeaderboardsService,
    private readonly viewer: SocialViewer,
  ) {}

  /** Top 100 plus your own rank (`you` is null if you have no character yet). */
  @Get(':board')
  async board(@CurrentUser() user: AuthUser, @Param() params: LeaderboardParamsDto): Promise<LeaderboardDto> {
    return this.leaderboards.board(params.board, await this.viewer.optional(user));
  }
}
