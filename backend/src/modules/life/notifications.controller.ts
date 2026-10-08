import { Controller, DefaultValuePipe, Get, HttpCode, HttpStatus, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { NotificationDto, Paginated } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { NoCharacterException } from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly directory: CharacterDirectory,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor: string | undefined,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ): Promise<Paginated<NotificationDto>> {
    const character = await this.directory.findLivingByUser(user.userId);
    if (!character) throw new NoCharacterException();
    return this.notifications.list(character.id, cursor ?? null, Math.min(100, Math.max(1, limit)));
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentUser() user: AuthUser): Promise<void> {
    const character = await this.directory.findLivingByUser(user.userId);
    if (!character) throw new NoCharacterException();
    await this.notifications.markAllRead(character.id);
  }
}
