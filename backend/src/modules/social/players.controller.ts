import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import type { PlayerProfileDto, PlayerSearchResultDto, SocialPrivacyDto, VenuePlayersDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { PlayerSearchQueryDto, UpdatePrivacyDto, VenueParamsDto } from './dto/players.dto.js';
import { ProfilesService } from './profiles.service.js';
import { SocialViewer } from './social-viewer.service.js';

@Controller({ path: 'players', version: '1' })
export class PlayersController {
  constructor(
    private readonly session: CharacterSession,
    private readonly profiles: ProfilesService,
    private readonly viewer: SocialViewer,
  ) {}

  @Get()
  async search(@CurrentUser() user: AuthUser, @Query() query: PlayerSearchQueryDto): Promise<PlayerSearchResultDto> {
    return this.profiles.search((await this.viewer.of(user)).id, query.query);
  }

  @Get('me/privacy')
  async privacy(@CurrentUser() user: AuthUser): Promise<SocialPrivacyDto> {
    return this.profiles.privacy((await this.viewer.of(user)).id);
  }

  @Patch('me/privacy')
  updatePrivacy(@CurrentUser() user: AuthUser, @Body() body: UpdatePrivacyDto): Promise<SocialPrivacyDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.profiles.updatePrivacy(ctx, body), { touch: true });
  }

  @Get(':handle')
  async profile(@CurrentUser() user: AuthUser, @Param('handle') handle: string): Promise<PlayerProfileDto> {
    return this.profiles.profile(await this.viewer.of(user), handle);
  }
}

/** "Who's here" at a venue. Settles the viewer first so their own location is current. */
@Controller({ path: 'venues', version: '1' })
export class VenuePlayersController {
  constructor(
    private readonly session: CharacterSession,
    private readonly profiles: ProfilesService,
  ) {}

  @Get(':venueId/players')
  whoIsHere(@CurrentUser() user: AuthUser, @Param() params: VenueParamsDto): Promise<VenuePlayersDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.profiles.whoIsHere(ctx, params.venueId));
  }
}
