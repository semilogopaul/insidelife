import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ModerationCampaignDto, ModerationClubOrderDto, ModerationQueueDto } from '@insidelife/shared';
import type { Page } from '../../../common/utils/paging.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { Actor, AdminRoute, ExportThrottle } from '../common/admin.decorators.js';
import { exportFilters, sendCsv } from '../common/csv-response.js';
import { pageOfQuery } from '../common/list-query.dto.js';
import type { AdminPromotionRowDto } from '../interfaces/admin-moderation.interfaces.js';
import { AdminModerationService } from './admin-moderation.service.js';
import { AdminMarkRefundedDto, AdminRejectDto, PromotionHistoryQueryDto } from './dto/moderation.dto.js';

/** Paid billboard ads and club-play orders: the review queue, decisions, and the full history. */
@AdminRoute()
@Controller({ path: 'admin/moderation', version: '1' })
export class AdminModerationController {
  constructor(
    private readonly moderation: AdminModerationService,
    private readonly audit: AuditService,
  ) {}

  /** Waiting for review (soonest start first) and approved-then-rejected items waiting for a refund. */
  @Get('queue')
  queue(): Promise<ModerationQueueDto> {
    return this.moderation.queue();
  }

  @Get('history')
  history(@Query() query: PromotionHistoryQueryDto): Promise<Page<AdminPromotionRowDto>> {
    return this.moderation.history(query, pageOfQuery(query));
  }

  @ExportThrottle()
  @Get('history/export.csv')
  async export(@Query() query: PromotionHistoryQueryDto, @Actor() actor: AuditActor, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv, rows } = await this.moderation.exportCsv(query);
    await this.audit.recordNow(actor, {
      action: 'export.moderation',
      target: { type: 'campaign', id: null, label: `${rows} ads and club orders` },
      metadata: { rows, filters: exportFilters({ ...query, page: undefined, pageSize: undefined }) },
    });
    return sendCsv(res, 'moderation-history', csv);
  }

  @HttpCode(HttpStatus.OK)
  @Post('campaigns/:id/approve')
  approveCampaign(@Actor() actor: AuditActor, @Param('id', new ParseUUIDPipe()) id: string): Promise<ModerationCampaignDto> {
    return this.moderation.decideCampaign(actor, id, 'approve', null);
  }

  @HttpCode(HttpStatus.OK)
  @Post('campaigns/:id/reject')
  rejectCampaign(@Actor() actor: AuditActor, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: AdminRejectDto): Promise<ModerationCampaignDto> {
    return this.moderation.decideCampaign(actor, id, 'reject', body.reason.trim(), body.refund);
  }

  @HttpCode(HttpStatus.OK)
  @Post('campaigns/:id/refunded')
  campaignRefunded(@Actor() actor: AuditActor, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: AdminMarkRefundedDto): Promise<ModerationCampaignDto> {
    return this.moderation.decideCampaign(actor, id, 'mark-refunded', body.note?.trim() || null);
  }

  @HttpCode(HttpStatus.OK)
  @Post('club-orders/:id/approve')
  approveClubOrder(@Actor() actor: AuditActor, @Param('id', new ParseUUIDPipe()) id: string): Promise<ModerationClubOrderDto> {
    return this.moderation.decideClubOrder(actor, id, 'approve', null);
  }

  @HttpCode(HttpStatus.OK)
  @Post('club-orders/:id/reject')
  rejectClubOrder(@Actor() actor: AuditActor, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: AdminRejectDto): Promise<ModerationClubOrderDto> {
    return this.moderation.decideClubOrder(actor, id, 'reject', body.reason.trim(), body.refund);
  }

  @HttpCode(HttpStatus.OK)
  @Post('club-orders/:id/refunded')
  clubOrderRefunded(@Actor() actor: AuditActor, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: AdminMarkRefundedDto): Promise<ModerationClubOrderDto> {
    return this.moderation.decideClubOrder(actor, id, 'mark-refunded', body.note?.trim() || null);
  }
}
