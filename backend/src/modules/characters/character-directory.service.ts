import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
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

  /** The character that represents an account: the living one, else the most recent. */
  findLatestByUser(userId: string, manager?: EntityManager): Promise<CharacterEntity | null> {
    return (manager?.getRepository(CharacterEntity) ?? this.characters).findOne({
      where: { userId },
      order: { alive: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Hide (or show again) an account's living character from other players while the account is deleted, inside the
   * caller's transaction. Returns how many characters changed.
   */
  async setHiddenForUser(manager: EntityManager, userId: string, hiddenAt: Date | null): Promise<number> {
    const result = await manager.update(CharacterEntity, { userId, alive: true }, { hiddenAt });
    return result.affected ?? 0;
  }
}

/** How a character reads in admin screens and the audit log: `@tolu_b (Tolu Bakare)`. */
export const characterLabel = (character: Pick<CharacterEntity, 'handle' | 'firstName' | 'lastName'>): string =>
  `@${character.handle} (${character.firstName} ${character.lastName})`;
