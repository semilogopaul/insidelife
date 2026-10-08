import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { CharacterEntity } from './entities/character.entity.js';

/** Read-only lookups other modules use (auth, realtime, transfers) without touching simulation logic. */
@Injectable()
export class CharacterDirectory {
  constructor(@InjectRepository(CharacterEntity) private readonly characters: Repository<CharacterEntity>) {}

  async hasLivingCharacter(userId: string): Promise<boolean> {
    return this.characters.exists({ where: { userId, alive: true } });
  }

  findLivingByUser(userId: string): Promise<CharacterEntity | null> {
    return this.characters.findOne({ where: { userId, alive: true } });
  }

  findByHandle(handle: string): Promise<CharacterEntity | null> {
    return this.characters.findOne({ where: { handle: handle.trim().toLowerCase().replace(/^@/, '') } });
  }

  findById(id: string): Promise<CharacterEntity | null> {
    return this.characters.findOne({ where: { id } });
  }

  /** The most recently deceased character of a user (for the epitaph screen). */
  findLastDeceased(userId: string): Promise<CharacterEntity | null> {
    return this.characters.findOne({ where: { userId, alive: false }, order: { diedAt: 'DESC' } });
  }

  async isHandleTaken(handle: string): Promise<boolean> {
    return this.characters.exists({ where: { handle: handle.toLowerCase() } });
  }
}
