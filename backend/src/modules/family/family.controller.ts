import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import type { FamilyTreeDto, SuccessionDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { UpdateChildDto } from './dto/update-child.dto.js';
import { FamilyService } from './family.service.js';
import { SuccessionService } from './services/succession.service.js';

/** The Family app: family tree, children's schools and the dynasty's history. */
@Controller({ path: 'family', version: '1' })
export class FamilyController {
  constructor(
    private readonly session: CharacterSession,
    private readonly family: FamilyService,
    private readonly succession: SuccessionService,
  ) {}

  @Get()
  tree(@CurrentUser() user: AuthUser): Promise<FamilyTreeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.family.tree(ctx));
  }

  /** Past generations of this player's dynasty (works even when no character is alive, for the epitaph screen). */
  @Get('legacy')
  legacy(@CurrentUser() user: AuthUser): Promise<SuccessionDto[]> {
    return this.succession.history(user.userId);
  }

  @Patch('children/:id')
  updateChild(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateChildDto): Promise<FamilyTreeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.family.setChildSchool(ctx, id, body.schoolTier), { touch: true });
  }
}
