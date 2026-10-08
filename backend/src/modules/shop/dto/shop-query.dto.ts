import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SHOP_CATEGORIES, type ShopCategory, type ShopQuery } from '@insidelife/shared';

export class ShopQueryDto implements ShopQuery {
  @IsOptional()
  @IsIn(SHOP_CATEGORIES)
  readonly category?: ShopCategory;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly venueId?: string;
}
