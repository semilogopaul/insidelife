import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { ClickTargetDto, ClubRotationDto, LiveBillboardsDto } from '@insidelife/shared';
import { Public } from '../../common/decorators/public.decorator.js';
import { CampaignsService } from './campaigns.service.js';
import { ClubRotationQueryDto, TrackClickDto, TrackImpressionsDto, TrackPlayDto } from './dto/tracking.dto.js';
import { TracksService } from './tracks.service.js';
import { TrackingService } from './tracking/tracking.service.js';
import { ViewerResolver } from './tracking/viewer-resolver.service.js';

/**
 * What the 3D world reads and reports: live billboards, club rotations, impressions, clicks and plays. Public (the
 * world renders before/without a fresh token); tracking counts only when a valid access token is sent.
 */
@Public()
@Controller({ path: 'promotions', version: '1' })
export class PromotionsWorldController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly tracks: TracksService,
    private readonly tracking: TrackingService,
    private readonly viewers: ViewerResolver,
  ) {}

  @Get('billboards/live')
  @Header('Cache-Control', 'public, max-age=60')
  liveBillboards(): Promise<LiveBillboardsDto> {
    return this.campaigns.liveBillboards();
  }

  @Get('club-rotation')
  @Header('Cache-Control', 'public, max-age=60')
  clubRotation(@Query() query: ClubRotationQueryDto): Promise<ClubRotationDto> {
    return this.tracks.rotation(query.venueId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('impressions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async impressions(@Req() request: Request, @Body() body: TrackImpressionsDto): Promise<void> {
    await this.tracking.impressions(await this.viewers.userIdOf(request), body.campaignIds);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('clicks')
  @HttpCode(HttpStatus.OK)
  async click(@Req() request: Request, @Body() body: TrackClickDto): Promise<ClickTargetDto> {
    return this.tracking.click(await this.viewers.userIdOf(request), body.campaignId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('plays')
  @HttpCode(HttpStatus.NO_CONTENT)
  async play(@Req() request: Request, @Body() body: TrackPlayDto): Promise<void> {
    await this.tracking.play(await this.viewers.userIdOf(request), body.trackId, body.venueId);
  }
}
