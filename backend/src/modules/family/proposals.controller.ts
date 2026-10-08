import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ProposalDto, ProposalsDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { CreateProposalDto, HandleParamDto } from './dto/proposal.dto.js';
import { PlayerLinksService } from './services/player-links.service.js';

/** Player-to-player friendship, dating and marriage — by mutual consent. */
@Controller({ version: '1' })
export class ProposalsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly links: PlayerLinksService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('players/:handle/proposals')
  propose(@CurrentUser() user: AuthUser, @Param() params: HandleParamDto, @Body() body: CreateProposalDto): Promise<ProposalDto> {
    return this.session.run(
      { userId: user.userId },
      (ctx) => this.links.propose(ctx, { handle: params.handle }, body.kind, { ringValue: body.ringValue, message: body.message }),
      { touch: true },
    );
  }

  @Get('proposals')
  list(@CurrentUser() user: AuthUser): Promise<ProposalsDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.links.list(ctx));
  }

  @Post('proposals/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ProposalDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.links.respond(ctx, id, true), { touch: true });
  }

  @Post('proposals/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ProposalDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.links.respond(ctx, id, false), { touch: true });
  }
}
