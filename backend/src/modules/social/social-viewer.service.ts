import { Injectable } from '@nestjs/common';
import { NoCharacterException } from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';

/** Resolves the signed-in player's living character for read-only social endpoints (no lock, no settle). */
@Injectable()
export class SocialViewer {
  constructor(private readonly directory: CharacterDirectory) {}

  async of(user: AuthUser): Promise<CharacterEntity> {
    const character = await this.directory.findLivingByUser(user.userId);
    if (!character) throw new NoCharacterException();
    return character;
  }

  optional(user: AuthUser): Promise<CharacterEntity | null> {
    return this.directory.findLivingByUser(user.userId);
  }
}
