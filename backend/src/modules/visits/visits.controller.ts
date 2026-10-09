import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { HomePeopleDto, VisitDto, VisitsDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { InviteVisitDto } from './dto/visits.dto.js';
import { VisitsService } from './visits.service.js';

@Controller({ path: 'visits', version: '1' })
export class VisitsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly visits: VisitsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<VisitsDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.visits.list(ctx));
  }

  /** Invite a player over (again: refreshes the invite). */
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  invite(@CurrentUser() user: AuthUser, @Body() body: InviteVisitDto): Promise<VisitDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.visits.invite(ctx, body.handle), {
      touch: true,
    });
  }

  @Post(':id/acceptance')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<VisitDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.visits.accept(ctx, id), { touch: true });
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.session.run({ userId: user.userId }, (ctx) => this.visits.decline(ctx, id), { touch: true });
  }

  /** Host or guest ends the visit. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.session.run({ userId: user.userId }, (ctx) => this.visits.end(ctx, id), { touch: true });
  }

  /** Who's in a home right now (host and guests), for drawing them in the room. */
  @Get('homes/:hostId/people')
  people(
    @CurrentUser() user: AuthUser,
    @Param('hostId', ParseUUIDPipe) hostId: string,
  ): Promise<HomePeopleDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.visits.people(ctx, hostId));
  }
}
