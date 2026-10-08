import { Body, Controller, Get, Put } from '@nestjs/common';
import type { WardrobeDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { UpdateWardrobeDto } from './dto/wardrobe.dto.js';
import { WardrobeService } from './wardrobe.service.js';

/** The dressing room (Me → Wardrobe). */
@Controller({ path: 'wardrobe', version: '1' })
export class WardrobeController {
  constructor(
    private readonly session: CharacterSession,
    private readonly wardrobe: WardrobeService,
  ) {}

  @Get()
  view(@CurrentUser() user: AuthUser): Promise<WardrobeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.wardrobe.view(ctx));
  }

  @Put()
  equip(@CurrentUser() user: AuthUser, @Body() body: UpdateWardrobeDto): Promise<WardrobeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.wardrobe.equip(ctx, body.outfit), { touch: true });
  }
}
