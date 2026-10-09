import type { VisitPersonDto } from '@insidelife/shared';
import type { CharacterEntity } from '../characters/entities/character.entity.js';

/** Character columns a visit needs to draw (and place) the host and guests. */
export const PERSON_COLUMNS = {
  id: true,
  handle: true,
  firstName: true,
  lastName: true,
  gender: true,
  appearance: true,
  outfit: true,
  locationId: true,
  homePropertyId: true,
  homeDistrictId: true,
  activity: true,
  alive: true,
  bornAt: true,
} as const;

export type Person = Pick<CharacterEntity, keyof typeof PERSON_COLUMNS>;

export function toPersonDto(character: Person): VisitPersonDto {
  return {
    id: character.id,
    handle: character.handle,
    firstName: character.firstName,
    lastName: character.lastName,
    gender: character.gender,
    appearance: character.appearance,
    outfit: character.outfit,
  };
}
