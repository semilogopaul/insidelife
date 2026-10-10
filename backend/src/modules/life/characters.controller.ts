import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { yearsBetween, type CharacterSnapshotDto, type LastLifeDto, type PlayStateDto, type PublicCharacterDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { WorldService } from '../world/world.service.js';
import { CharacterCreationService } from './character-creation.service.js';
import { CreateCharacterDto } from './dto/create-character.dto.js';
import { UpdatePlayStateDto } from './dto/play-state.dto.js';
import { UpdateSettingsDto } from './dto/settings.dto.js';
import { PlayStateService } from './play-state.service.js';
import { SettingsService } from './settings.service.js';
import { SnapshotService } from './snapshot.service.js';

@Controller({ path: 'characters', version: '1' })
export class CharactersController {
  constructor(
    private readonly creation: CharacterCreationService,
    private readonly session: CharacterSession,
    private readonly snapshots: SnapshotService,
    private readonly settings: SettingsService,
    private readonly playState: PlayStateService,
    private readonly directory: CharacterDirectory,
    private readonly presence: PresenceService,
    private readonly world: WorldService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateCharacterDto): Promise<CharacterSnapshotDto> {
    await this.creation.create(user.userId, body);
    return this.session.run({ userId: user.userId }, (ctx) => this.snapshots.build(ctx), { touch: true });
  }

  /**
   * Reading isn't playing: a refetch from a background tab mustn't hold off the autopilot. The client reports the
   * player at the controls through `PUT me/play-state`.
   */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<CharacterSnapshotDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.snapshots.build(ctx));
  }

  /**
   * `playing` while the tab is visible and in use (sent every ~45 s), `away` when the player leaves. While playing the
   * autopilot leaves the character alone; `resumed` tells the client to refetch a timeline planned for the autopilot.
   */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Put('me/play-state')
  updatePlayState(@CurrentUser() user: AuthUser, @Body() body: UpdatePlayStateDto): Promise<PlayStateDto> {
    return this.session.run({ userId: user.userId }, async (ctx) => this.playState.update(ctx, body.state));
  }

  @Patch('me/settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() body: UpdateSettingsDto): Promise<CharacterSnapshotDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        await this.settings.update(ctx, body);
        return this.snapshots.build(ctx);
      },
      { touch: true },
    );
  }

  /** The life that just ended (dead character + whether an heir continues), for the epitaph screen. */
  @Get('me/last-life')
  async lastLife(@CurrentUser() user: AuthUser): Promise<LastLifeDto> {
    const dead = await this.directory.findLastDeceased(user.userId);
    if (!dead || dead.diedAt === null) throw new ResourceNotFoundException('Previous life');
    const heir = await this.directory.findLivingByUser(user.userId);
    return {
      characterId: dead.id,
      name: `${dead.firstName} ${dead.lastName}`,
      handle: dead.handle,
      ageAtDeath: yearsBetween(dead.bornAt, dead.diedAt),
      bornAt: dead.bornAt,
      diedAt: dead.diedAt,
      causeOfDeath: dead.causeOfDeath,
      generation: dead.generation,
      netWorth: dead.netWorth,
      selfMadeNetWorth: Math.max(0, dead.netWorth - dead.unearnedTotal),
      heirContinues: heir !== null && heir.dynastyId === dead.dynastyId,
    };
  }

  @Get('handles/:handle/availability')
  @HttpCode(HttpStatus.OK)
  async handleAvailability(@Param('handle') handle: string): Promise<{ available: boolean }> {
    const normalised = handle.toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(normalised)) return { available: false };
    return { available: !(await this.directory.isHandleTaken(normalised)) };
  }

  @Get(':handle')
  async profile(@Param('handle') handle: string): Promise<PublicCharacterDto> {
    const character = await this.directory.findByHandle(handle);
    if (!character || character.hiddenAt) throw new ResourceNotFoundException('Player');
    const online = await this.presence.isOnline(character.id);
    return this.snapshots.publicDto(character, this.world.now(), online, null);
  }
}
