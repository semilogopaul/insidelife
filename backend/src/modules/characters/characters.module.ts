import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharacterDirectory } from './character-directory.service.js';
import { CharacterEntity } from './entities/character.entity.js';

/**
 * Owns the character table. Deliberately thin: lookups only. Simulation and gameplay live in the `simulation` and
 * `life` modules, which import this one.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CharacterEntity])],
  providers: [CharacterDirectory],
  exports: [CharacterDirectory, TypeOrmModule],
})
export class CharactersModule {}
