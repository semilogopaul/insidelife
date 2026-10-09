import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { pageRequest, type PageRequest } from '../../../common/utils/paging.js';

/** Paging, free-text search, sort direction and a date range: what every admin table sends. */
export class AdminListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  readonly page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  readonly q?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  readonly order?: 'asc' | 'desc';

  /** ISO date or time, inclusive. */
  @IsOptional()
  @IsISO8601()
  readonly from?: string;

  /** ISO date or time, exclusive. */
  @IsOptional()
  @IsISO8601()
  readonly to?: string;
}

export const pageOfQuery = (query: AdminListQueryDto): PageRequest => pageRequest(query.page, query.pageSize);

/** A mandatory note for any admin action that affects a player or their content. */
export class AdminReasonDto {
  @IsString()
  @MaxLength(500)
  readonly reason: string;
}

export class UuidParamDto {
  @IsUUID()
  readonly id: string;
}
