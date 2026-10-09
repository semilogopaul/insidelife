import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { AUDIT_TARGET_TYPES, type AuditQuery, type AuditTargetType } from '../../../audit/audit.types.js';
import { AdminListQueryDto } from '../../common/list-query.dto.js';

/** `GET /v1/admin/audit-logs` (and the CSV). `from`/`to` filter when it happened. */
export class AuditQueryDto extends AdminListQueryDto implements AuditQuery {
  @IsOptional()
  @IsUUID()
  readonly actorUserId?: string;

  /** Actor email, partial. */
  @IsOptional()
  @IsString()
  @MaxLength(254)
  readonly actor?: string;

  /** Exact action (`player.suspend`) or a prefix ending in a dot (`player.`). */
  @IsOptional()
  @Matches(/^[a-z-]+(\.[a-z-]*)?$/, { message: 'Unknown action' })
  @MaxLength(64)
  readonly action?: string;

  @IsOptional()
  @IsIn(AUDIT_TARGET_TYPES)
  readonly targetType?: AuditTargetType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly targetId?: string;
}
