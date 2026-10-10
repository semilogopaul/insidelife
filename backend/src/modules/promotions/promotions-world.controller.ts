import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { ClickTargetDto, ClubRotationDto, ClubScheduleDto, LiveBillboardsDto } from '@insidelife/shared';
import { Public } from '../../common/decorators/public.decorator.js';
import { CampaignsService } from './campaigns.service.js';
import { ClubScheduleService } from './club-schedule.service.js';
import { ClubRotationQueryDto, TrackClickDto, TrackImpressionsDto, TrackPlayDto, TrackViewsDto } from './dto/tracking.dto.js';
import { TracksService } from './tracks.service.js';
import { TrackingService } from './tracking/tracking.service.js';
import { ViewerResolver } from './tracking/viewer-resolver.service.js';

/**
 * What the 3D world reads and reports: live billboards, the club schedule, views and link opens. Public (the world
 * renders before/without a fresh token); views count only when a valid access token is sent.
 */
@Public()
@Controller({ path: 'promotions', version: '1' })
export class PromotionsWorldController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly tracks: TracksService,
    private readonly schedule: ClubScheduleService,
    private readonly tracking: TrackingService,
    private readonly viewers: ViewerResolver,
  ) {}

  @Get('billboards/live')
  @Header('Cache-Control', 'public, max-age=60')
  liveBillboards(): Promise<LiveBillboardsDto> {
    return this.campaigns.liveBillboards();
  }

  /** Songs in rotation today, without times (older clients). The audio plays `club-schedule`. */
  @Get('club-rotation')
  @Header('Cache-Control', 'public, max-age=60')
  clubRotation(@Query() query: ClubRotationQueryDto): Promise<ClubRotationDto> {
    return this.tracks.rotation(query.venueId);
  }

  /** The paid songs and their exact start times in one club (what its audio plays). */
  @Get('club-schedule')
  @Header('Cache-Control', 'public, max-age=10')
  clubSchedule(@Query() query: ClubRotationQueryDto): Promise<ClubScheduleDto> {
    return this.schedule.schedule(query.venueId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('views')
  @HttpCode(HttpStatus.NO_CONTENT)
  async views(@Req() request: Request, @Body() body: TrackViewsDto): Promise<void> {
    await this.tracking.views(await this.viewers.userIdOf(request), body.views);
  }

  /** @deprecated Older clients: accepted and ignored (unverifiable). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('impressions')
  @HttpCode(HttpStatus.NO_CONTENT)
  impressions(@Body() _body: TrackImpressionsDto): void {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('clicks')
  @HttpCode(HttpStatus.OK)
  async click(@Req() request: Request, @Body() body: TrackClickDto): Promise<ClickTargetDto> {
    return this.tracking.click(await this.viewers.userIdOf(request), body.campaignId);
  }

  /** @deprecated Plays are counted by the server from its own schedule; older clients get a 204. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('plays')
  @HttpCode(HttpStatus.NO_CONTENT)
  play(@Body() _body: TrackPlayDto): void {}
}
