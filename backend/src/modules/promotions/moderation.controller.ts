import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { ModerationCampaignDto, ModerationClubOrderDto, ModerationQueueDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { MarkRefundedDto, RejectPromotionDto } from './dto/moderation.dto.js';
import { ModerationService } from './moderation.service.js';

/** Admin review of paid ads and club orders (admins = ADMIN_EMAILS). */
@UseGuards(RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/moderation', version: '1' })
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('queue')
  queue(): Promise<ModerationQueueDto> {
    return this.moderation.queue();
  }

  @Post('campaigns/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveCampaign(@CurrentUser() admin: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<ModerationCampaignDto> {
    return this.moderation.decideCampaign(admin.userId, id, { action: 'approve' }, null);
  }

  @Post('campaigns/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectCampaign(@CurrentUser() admin: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: RejectPromotionDto): Promise<ModerationCampaignDto> {
    return this.moderation.decideCampaign(admin.userId, id, { action: 'reject', refund: body.refund }, body.reason.trim());
  }

  @Post('campaigns/:id/refunded')
  @HttpCode(HttpStatus.OK)
  campaignRefunded(@CurrentUser() admin: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: MarkRefundedDto): Promise<ModerationCampaignDto> {
    return this.moderation.decideCampaign(admin.userId, id, { action: 'mark-refunded' }, body.note?.trim() || null);
  }

  @Post('club-orders/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveClubOrder(@CurrentUser() admin: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<ModerationClubOrderDto> {
    return this.moderation.decideClubOrder(admin.userId, id, { action: 'approve' }, null);
  }

  @Post('club-orders/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectClubOrder(@CurrentUser() admin: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: RejectPromotionDto): Promise<ModerationClubOrderDto> {
    return this.moderation.decideClubOrder(admin.userId, id, { action: 'reject', refund: body.refund }, body.reason.trim());
  }

  @Post('club-orders/:id/refunded')
  @HttpCode(HttpStatus.OK)
  clubOrderRefunded(@CurrentUser() admin: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: MarkRefundedDto): Promise<ModerationClubOrderDto> {
    return this.moderation.decideClubOrder(admin.userId, id, { action: 'mark-refunded' }, body.note?.trim() || null);
  }
}
