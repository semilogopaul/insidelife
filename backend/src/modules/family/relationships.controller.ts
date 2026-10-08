import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { InteractionResultDto, RelationshipDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { InteractionDto } from './dto/interaction.dto.js';
import { FamilyService } from './family.service.js';
import { InteractionsService } from './services/interactions.service.js';

/** Everyone in your life — family, friends, lovers, exes — and what you can do with them. */
@Controller({ path: 'relationships', version: '1' })
export class RelationshipsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly family: FamilyService,
    private readonly interactions: InteractionsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<RelationshipDto[]> {
    return this.session.run({ userId: user.userId }, (ctx) => this.family.list(ctx));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/interactions')
  @HttpCode(HttpStatus.OK)
  interact(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: InteractionDto): Promise<InteractionResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.interactions.interact(ctx, id, body), { touch: true });
  }
}
