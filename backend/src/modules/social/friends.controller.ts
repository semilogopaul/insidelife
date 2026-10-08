import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FriendDto, FriendRequestResultDto, FriendsOverviewDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { HandleDto } from './dto/handle.dto.js';
import { FriendsService } from './friends.service.js';
import { SocialViewer } from './social-viewer.service.js';

@Controller({ path: 'friends', version: '1' })
export class FriendsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly friends: FriendsService,
    private readonly viewer: SocialViewer,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<FriendsOverviewDto> {
    return this.friends.overview((await this.viewer.of(user)).id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('requests')
  request(@CurrentUser() user: AuthUser, @Body() body: HandleDto): Promise<FriendRequestResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.friends.request(ctx, body.handle), { touch: true });
  }

  @HttpCode(HttpStatus.OK)
  @Post('requests/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<FriendDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.friends.acceptRequest(ctx, id), { touch: true });
  }

  /** Decline an incoming request, or cancel one you sent. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('requests/:id/decline')
  async decline(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.session.run({ userId: user.userId }, (ctx) => this.friends.declineRequest(ctx, id), { touch: true });
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':characterId')
  async remove(@CurrentUser() user: AuthUser, @Param('characterId', new ParseUUIDPipe()) characterId: string): Promise<void> {
    await this.session.run({ userId: user.userId }, (ctx) => this.friends.remove(ctx, characterId), { touch: true });
  }
}
