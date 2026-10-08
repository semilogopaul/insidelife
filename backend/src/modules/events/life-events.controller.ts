import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { LifeEventDto, LifeEventOutcomeDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { ResolveLifeEventDto } from './dto/resolve-life-event.dto.js';
import { LifeEventsService } from './life-events.service.js';

@Controller({ path: 'life-events', version: '1' })
export class LifeEventsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly events: LifeEventsService,
  ) {}

  @Get()
  pending(@CurrentUser() user: AuthUser): Promise<LifeEventDto[]> {
    return this.session.run({ userId: user.userId }, (ctx) => this.events.pending(ctx));
  }

  @Post(':id/choices')
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveLifeEventDto,
  ): Promise<LifeEventOutcomeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.events.resolve(ctx, id, body.choiceId), { touch: true });
  }
}
