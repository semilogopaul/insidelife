import { Controller, Get, Param, Query } from '@nestjs/common';
import type { FobesListDto, FobesMeDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { FobesListParamsDto, FobesPageQueryDto } from './dto/players.dto.js';
import { FobesService } from './fobes.service.js';
import { SocialViewer } from './social-viewer.service.js';

/** Fobes, the Lagos Rich List phone app: read-only and cached, so no session lock or settle. */
@Controller({ path: 'fobes', version: '1' })
export class FobesController {
  constructor(
    private readonly fobes: FobesService,
    private readonly viewer: SocialViewer,
  ) {}

  /** One page (20) of a list's top 100. */
  @Get('lists/:list')
  async list(@CurrentUser() user: AuthUser, @Param() params: FobesListParamsDto, @Query() query: FobesPageQueryDto): Promise<FobesListDto> {
    return this.fobes.list(params.list, query.page ?? 1, await this.viewer.optional(user));
  }

  /** Where you stand on each list, the gap to the next place, and your week. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<FobesMeDto> {
    return this.fobes.me(await this.viewer.of(user));
  }
}
