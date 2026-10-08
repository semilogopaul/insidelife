import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import {
  BODY_TYPES,
  EYE_STYLES,
  FACIAL_HAIR,
  GENDERS,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  STATES_OF_ORIGIN,
  type Appearance,
  type BodyType,
  type CreateCharacterRequest,
  type EyeStyle,
  type FacialHair,
  type Gender,
  type HairStyle,
} from '@insidelife/shared';

export class AppearanceDto implements Appearance {
  @IsIn(BODY_TYPES)
  readonly bodyType: BodyType;

  @IsNumber()
  @Min(0.92)
  @Max(1.08)
  readonly height: number;

  @IsInt()
  @Min(0)
  @Max(SKIN_TONES.length - 1)
  readonly skinTone: number;

  @IsIn(HAIR_STYLES)
  readonly hairStyle: HairStyle;

  @IsInt()
  @Min(0)
  @Max(HAIR_COLORS.length - 1)
  readonly hairColor: number;

  @IsIn(FACIAL_HAIR)
  readonly facialHair: FacialHair;

  @IsIn(EYE_STYLES)
  readonly eyeStyle: EyeStyle;
}

const NAME_PATTERN = /^[\p{L}][\p{L}'’ -]{0,38}[\p{L}]$/u;

export class CreateCharacterDto implements CreateCharacterRequest {
  @IsString()
  @Matches(NAME_PATTERN, { message: 'First name should be 2-40 letters' })
  readonly firstName: string;

  @IsString()
  @Matches(NAME_PATTERN, { message: 'Surname should be 2-40 letters' })
  readonly lastName: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-z0-9_]+$/, { message: 'Handle can only use lower-case letters, numbers and _' })
  readonly handle: string;

  @IsIn(GENDERS)
  readonly gender: Gender;

  @IsIn(STATES_OF_ORIGIN.map((state) => state.id))
  readonly stateOfOrigin: string;

  @ValidateNested()
  @Type(() => AppearanceDto)
  readonly appearance: AppearanceDto;
}
