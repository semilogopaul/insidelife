import { IsIn, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import {
  FLOOR_FINISHES,
  GATE_COLOURS,
  HOUSE_NAME_PATTERN,
  HOUSE_PAINTS,
  ROOF_COLOURS,
  WALL_PAINTS,
  type DecorMakeoverRequest,
  type ExteriorMakeoverRequest,
  type FloorFinishId,
  type GateColourId,
  type HousePaintId,
  type RoofColourId,
  type WallPaintId,
} from '@insidelife/shared';

const ids = (list: readonly { readonly id: string }[]): string[] => list.map((entry) => entry.id);

export class ExteriorMakeoverDto implements ExteriorMakeoverRequest {
  @IsOptional()
  @IsIn(ids(HOUSE_PAINTS))
  readonly paint?: HousePaintId;

  @IsOptional()
  @IsIn(ids(ROOF_COLOURS))
  readonly roof?: RoofColourId;

  @IsOptional()
  @IsIn(ids(GATE_COLOURS))
  readonly gate?: GateColourId;

  /** null (or empty) puts back the default plate. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @Matches(HOUSE_NAME_PATTERN, { message: "House names are 2-24 letters, numbers, spaces and . & - '" })
  readonly name?: string | null;
}

export class DecorMakeoverDto implements DecorMakeoverRequest {
  @IsOptional()
  @IsIn(ids(WALL_PAINTS))
  readonly paint?: WallPaintId;

  @IsOptional()
  @IsIn(ids(FLOOR_FINISHES))
  readonly floor?: FloorFinishId;
}
