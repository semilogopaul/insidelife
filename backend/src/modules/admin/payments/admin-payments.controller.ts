import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { Actor, AdminRoute, ExportThrottle } from '../common/admin.decorators.js';
import { exportFilters, sendCsv } from '../common/csv-response.js';
import { pageOfQuery } from '../common/list-query.dto.js';
import { AdminPaymentsService } from './admin-payments.service.js';
import { PaymentsQueryDto, type AdminPaymentsPageDto } from './dto/payments.dto.js';

/** Real-money payments: top-ups, billboard ads and club plays (read-only; refunds go through moderation). */
@AdminRoute()
@Controller({ path: 'admin/payments', version: '1' })
export class AdminPaymentsController {
  constructor(
    private readonly payments: AdminPaymentsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: PaymentsQueryDto): Promise<AdminPaymentsPageDto> {
    return this.payments.list(query, pageOfQuery(query));
  }

  @ExportThrottle()
  @Get('export.csv')
  async export(@Query() query: PaymentsQueryDto, @Actor() actor: AuditActor, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv, rows } = await this.payments.exportCsv(query);
    await this.audit.recordNow(actor, {
      action: 'export.payments',
      target: { type: 'payment', id: null, label: `${rows} payments` },
      metadata: { rows, filters: exportFilters({ ...query, page: undefined, pageSize: undefined }) },
    });
    return sendCsv(res, 'payments', csv);
  }
}
