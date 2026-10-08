import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CreatePartyResultDto, PartyDetailDto, PartyDto, PartyQuoteDto, SprayResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { WorldService } from '../world/world.service.js';
import { CreatePartyDto, PartyQuoteQueryDto, SprayDto } from './dto/party.dto.js';
import { PartiesService } from './parties.service.js';
import { SocialViewer } from './social-viewer.service.js';

@Controller({ path: 'parties', version: '1' })
export class PartiesController {
  constructor(
    private readonly session: CharacterSession,
    private readonly parties: PartiesService,
    private readonly viewer: SocialViewer,
    private readonly world: WorldService,
  ) {}

  /** Live and upcoming parties, nearest and friends' first. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PartyDto[]> {
    return this.session.run({ userId: user.userId }, (ctx) => this.parties.list(ctx));
  }

  /** Price a party before booking (every cost shown before you commit). */
  @Get('quotes')
  quote(@CurrentUser() user: AuthUser, @Query() query: PartyQuoteQueryDto): Promise<PartyQuoteDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.parties.quote(ctx, query));
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<PartyDetailDto> {
    return this.parties.detail((await this.viewer.of(user)).id, id, this.world.now());
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePartyDto): Promise<CreatePartyResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.parties.create(ctx, body), { touch: true });
  }

  /** Cancel before it starts (the caterer keeps half). */
  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<PartyDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.parties.cancel(ctx, id), { touch: true });
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/attendance')
  attend(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<PartyDetailDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.parties.attend(ctx, id), { touch: true });
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post(':id/sprays')
  spray(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: SprayDto): Promise<SprayResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.parties.spray(ctx, id, body), { touch: true });
  }
}
