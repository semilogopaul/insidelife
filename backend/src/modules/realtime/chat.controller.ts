import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_UPLOAD_FIELD,
  CHAT_VOICE_MAX_BYTES,
  type ChatMessageDto,
  type DmStateDto,
  type DmThreadDto,
  type Paginated,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  ForbiddenActionException,
  NoCharacterException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import { ChatService, dmCounterpart } from './chat.service.js';
import { MediaLinkQueryDto, UploadChatMediaDto } from './dto/chat.dto.js';
import type { UploadedChatFile } from './media/chat-media.service.js';

/** Multer limits: one in-memory file, one short text field, nothing else. */
const UPLOAD_LIMITS = {
  fileSize: Math.max(CHAT_IMAGE_MAX_BYTES, CHAT_VOICE_MAX_BYTES),
  files: 1,
  fields: 2,
  fieldSize: 64,
  parts: 4,
  headerPairs: 40,
};

@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly directory: CharacterDirectory,
    private readonly bus: RealtimeBus,
  ) {}

  @Get('channels/:channel/messages')
  async history(
    @CurrentUser() user: AuthUser,
    @Param('channel') channel: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit', new DefaultValuePipe(40), ParseIntPipe) limit: number,
  ): Promise<Paginated<ChatMessageDto>> {
    const character = await this.me(user);
    if (!this.chat.canAccess(character, channel))
      throw new ForbiddenActionException('You’re not in that chat');
    return this.chat.history(channel, cursor ?? null, Math.min(100, Math.max(1, limit)));
  }

  /** My private conversations and message requests, newest first (including people who messaged me first). */
  @Get('dms')
  async dmThreads(@CurrentUser() user: AuthUser): Promise<DmThreadDto[]> {
    return this.chat.dmThreads((await this.me(user)).id);
  }

  @Get('dms/:channel/state')
  async dmState(@CurrentUser() user: AuthUser, @Param('channel') channel: string): Promise<DmStateDto> {
    return this.chat.dmState((await this.me(user)).id, channel);
  }

  @Post('dms/:channel/accept')
  async acceptRequest(@CurrentUser() user: AuthUser, @Param('channel') channel: string): Promise<DmStateDto> {
    return this.chat.respondToRequest((await this.me(user)).id, channel, true);
  }

  @Post('dms/:channel/decline')
  async declineRequest(
    @CurrentUser() user: AuthUser,
    @Param('channel') channel: string,
  ): Promise<DmStateDto> {
    return this.chat.respondToRequest((await this.me(user)).id, channel, false);
  }

  @Post('dms/:channel/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentUser() user: AuthUser, @Param('channel') channel: string): Promise<void> {
    const character = await this.me(user);
    if (!dmCounterpart(channel, character.id)) throw new ForbiddenActionException('You’re not in that chat');
    await this.chat.markDmRead(character.id, channel);
  }

  /** A voice note or photo, pushed to both participants over the socket like any other message. */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('dms/:channel/media')
  @UseInterceptors(FileInterceptor(CHAT_UPLOAD_FIELD, { limits: UPLOAD_LIMITS }))
  async sendMedia(
    @CurrentUser() user: AuthUser,
    @Param('channel') channel: string,
    @Body() body: UploadChatMediaDto,
    @UploadedFile() file: UploadedChatFile | undefined,
  ): Promise<ChatMessageDto> {
    const character = await this.me(user);
    const message = await this.chat.sendMedia(character, channel, body.kind, file);
    for (const participant of channel.split(':').slice(1))
      this.bus.toCharacter(participant, 'chat:message', message);
    return message;
  }

  /** Signed, expiring media links (handed only to the people in the chat); <audio>/<img> can't send auth headers. */
  @Public()
  @Get('media/:id')
  @Header('Cache-Control', 'private, max-age=21600')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Disposition', 'inline')
  async media(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: MediaLinkQueryDto,
  ): Promise<StreamableFile> {
    const stored = await this.chat.openMedia(id, query.exp, query.sig);
    if (!stored) throw new ResourceNotFoundException('Media');
    return new StreamableFile(stored.body, { type: stored.contentType, length: stored.bytes ?? undefined });
  }

  private async me(user: AuthUser): Promise<CharacterEntity> {
    const character = await this.directory.findLivingByUser(user.userId);
    if (!character) throw new NoCharacterException();
    return character;
  }
}
