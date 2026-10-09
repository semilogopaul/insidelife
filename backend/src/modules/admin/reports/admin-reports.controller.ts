import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Page } from '../../../common/utils/paging.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { Actor, AdminRoute, ExportThrottle } from '../common/admin.decorators.js';
import { exportFilters, sendCsv } from '../common/csv-response.js';
import { pageOfQuery } from '../common/list-query.dto.js';
import { AdminReportsService } from './admin-reports.service.js';
import { ReportDecisionDto, ReportsQueryDto, type AdminReportRowDto } from './dto/reports.dto.js';

/** Player reports: the queue and history, and closing them with a note. */
@AdminRoute()
@Controller({ path: 'admin/reports', version: '1' })
export class AdminReportsController {
  constructor(
    private readonly reports: AdminReportsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: ReportsQueryDto): Promise<Page<AdminReportRowDto>> {
    return this.reports.list(query, pageOfQuery(query));
  }

  @ExportThrottle()
  @Get('export.csv')
  async export(@Query() query: ReportsQueryDto, @Actor() actor: AuditActor, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv, rows } = await this.reports.exportCsv(query);
    await this.audit.recordNow(actor, {
      action: 'export.reports',
      target: { type: 'report', id: null, label: `${rows} reports` },
      metadata: { rows, filters: exportFilters({ ...query, page: undefined, pageSize: undefined }) },
    });
    return sendCsv(res, 'reports', csv);
  }

  /** Something was done about it (warned, suspended, content removed…). */
  @HttpCode(HttpStatus.OK)
  @Post(':id/resolve')
  resolve(@Actor() actor: AuditActor, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: ReportDecisionDto): Promise<AdminReportRowDto> {
    return this.reports.close(actor, id, 'actioned', body.note.trim());
  }

  /** Nothing to act on. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/dismiss')
  dismiss(@Actor() actor: AuditActor, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: ReportDecisionDto): Promise<AdminReportRowDto> {
    return this.reports.close(actor, id, 'dismissed', body.note.trim());
  }
}
