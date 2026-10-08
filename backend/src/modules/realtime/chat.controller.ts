import { Controller, DefaultValuePipe, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { ChatMessageDto, DmThreadDto, Paginated } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ForbiddenActionException, NoCharacterException } from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { ChatService } from './chat.service.js';

@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly directory: CharacterDirectory,
  ) {}

  @Get('channels/:channel/messages')
  async history(
    @CurrentUser() user: AuthUser,
    @Param('channel') channel: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit', new DefaultValuePipe(40), ParseIntPipe) limit: number,
  ): Promise<Paginated<ChatMessageDto>> {
    const character = await this.directory.findLivingByUser(user.userId);
    if (!character) throw new NoCharacterException();
    if (!this.chat.canAccess(character, channel)) throw new ForbiddenActionException('You’re not in that chat');
    return this.chat.history(channel, cursor ?? null, Math.min(100, Math.max(1, limit)));
  }

  /** My private conversations, newest first (including people who messaged me first). */
  @Get('dms')
  async dmThreads(@CurrentUser() user: AuthUser): Promise<DmThreadDto[]> {
    const character = await this.directory.findLivingByUser(user.userId);
    if (!character) throw new NoCharacterException();
    return this.chat.dmThreads(character.id);
  }

  @Post('dms/:channel/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentUser() user: AuthUser, @Param('channel') channel: string): Promise<void> {
    const character = await this.directory.findLivingByUser(user.userId);
    if (!character) throw new NoCharacterException();
    if (!channel.startsWith('dm:') || !this.chat.canAccess(character, channel)) throw new ForbiddenActionException('You’re not in that chat');
    await this.chat.markDmRead(character.id, channel);
  }
}
