import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PURCHASE_QUANTITY, type ShopPurchaseRequest } from '@insidelife/shared';

export class ShopPurchaseDto implements ShopPurchaseRequest {
  @IsString()
  @MaxLength(64)
  readonly itemId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PURCHASE_QUANTITY)
  readonly quantity?: number;
}
