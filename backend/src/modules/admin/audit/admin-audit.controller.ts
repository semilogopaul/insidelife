import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Page } from '../../../common/utils/paging.js';
import { AuditService } from '../../audit/audit.service.js';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, type AuditActor, type AuditEntryDto } from '../../audit/audit.types.js';
import { Actor, AdminRoute, ExportThrottle } from '../common/admin.decorators.js';
import { exportFilters, sendCsv } from '../common/csv-response.js';
import { pageOfQuery } from '../common/list-query.dto.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';

/** The audit log: who did what, to whom, where and when. Read-only (the table itself refuses edits). */
@AdminRoute()
@Controller({ path: 'admin/audit-logs', version: '1' })
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQueryDto): Promise<Page<AuditEntryDto>> {
    return this.audit.list(query, pageOfQuery(query));
  }

  /** The values the filters offer. */
  @Get('facets')
  facets(): { readonly actions: readonly string[]; readonly targetTypes: readonly string[] } {
    return { actions: AUDIT_ACTIONS, targetTypes: AUDIT_TARGET_TYPES };
  }

  @ExportThrottle()
  @Get('export.csv')
  async export(@Query() query: AuditQueryDto, @Actor() actor: AuditActor, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv, rows } = await this.audit.exportCsv(query);
    await this.audit.recordNow(actor, {
      action: 'export.audit',
      target: { type: 'audit-log', id: null, label: `${rows} audit entries` },
      metadata: { rows, filters: exportFilters({ ...query, page: undefined, pageSize: undefined }) },
    });
    return sendCsv(res, 'audit-log', csv);
  }
}
