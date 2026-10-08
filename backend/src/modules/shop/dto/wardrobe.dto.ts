import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import type { ClothingSlot, Outfit, UpdateWardrobeRequest } from '@insidelife/shared';

/** One optional clothing id per avatar slot; unknown slots are rejected by the global whitelist. */
export class OutfitDto implements Outfit, Partial<Record<ClothingSlot, string>> {
  @IsOptional() @IsString() @MaxLength(64) readonly top?: string;
  @IsOptional() @IsString() @MaxLength(64) readonly bottom?: string;
  @IsOptional() @IsString() @MaxLength(64) readonly full?: string;
  @IsOptional() @IsString() @MaxLength(64) readonly shoes?: string;
  @IsOptional() @IsString() @MaxLength(64) readonly headwear?: string;
  @IsOptional() @IsString() @MaxLength(64) readonly eyewear?: string;
  @IsOptional() @IsString() @MaxLength(64) readonly accessory?: string;
}

export class UpdateWardrobeDto implements UpdateWardrobeRequest {
  @IsDefined()
  @ValidateNested()
  @Type(() => OutfitDto)
  readonly outfit: OutfitDto;
}
