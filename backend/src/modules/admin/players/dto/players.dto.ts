import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, NotEquals } from 'class-validator';
import { AdminListQueryDto } from '../../common/list-query.dto.js';

export const PLAYER_STATUS_FILTERS = ['all', 'active', 'suspended', 'deleted', 'purged'] as const;
export type PlayerStatusFilter = (typeof PLAYER_STATUS_FILTERS)[number];

export const PLAYER_SORTS = ['createdAt', 'lastActiveAt', 'lastLoginAt', 'email', 'handle', 'netWorth', 'cash'] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];

const booleanQuery = ({ value }: { value: unknown }): unknown => (value === 'true' ? true : value === 'false' ? false : value);

/** `GET /v1/admin/players` (and the CSV export). `from`/`to` filter the sign-up date. */
export class PlayersQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(PLAYER_STATUS_FILTERS)
  readonly status?: PlayerStatusFilter;

  @IsOptional()
  @IsIn(['player', 'admin'])
  readonly role?: 'player' | 'admin';

  @IsOptional()
  @Transform(booleanQuery)
  @IsBoolean()
  readonly hasCharacter?: boolean;

  /** Last seen in the game (or signed in) on or after… */
  @IsOptional()
  @IsISO8601()
  readonly activeFrom?: string;

  @IsOptional()
  @IsISO8601()
  readonly activeTo?: string;

  @IsOptional()
  @IsIn(PLAYER_SORTS)
  readonly sort?: PlayerSort;
}

export class LedgerQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly pageSize?: number;
}

export class PlayerReasonDto {
  @IsString()
  @MinLength(5, { message: 'Give a reason (at least 5 characters)' })
  @MaxLength(500)
  readonly reason: string;
}

/** Credit (positive) or debit (negative) a player's cash, through the ledger as an `adjustment`. */
export class WalletAdjustmentDto {
  /** Whole naira, signed, not zero. */
  @Type(() => Number)
  @IsInt({ message: 'Use whole naira' })
  @NotEquals(0, { message: 'The amount can’t be zero' })
  @Min(-100_000_000)
  @Max(100_000_000)
  readonly amount: number;

  @IsString()
  @MinLength(5, { message: 'Give a reason (at least 5 characters)' })
  @MaxLength(500)
  readonly reason: string;

  /** Made by the portal when the dialog opens: submitting twice applies the adjustment once. */
  @IsUUID()
  readonly idempotencyKey: string;
}
