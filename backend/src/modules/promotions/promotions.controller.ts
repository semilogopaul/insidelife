import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  CREATIVE_MAX_BYTES,
  PROMOTION_UPLOAD_FIELD,
  TRACK_MAX_BYTES,
  type AdCampaignDto,
  type BillboardSlotsDto,
  type CampaignCheckoutDto,
  type ClubOrderCheckoutDto,
  type ClubTrackDto,
  type CreativeDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CampaignsService } from './campaigns.service.js';
import { CreativeService } from './creative.service.js';
import { CreateCampaignDto, UploadCreativeDto } from './dto/campaign.dto.js';
import { CreateClubOrderDto, UploadTrackDto } from './dto/track.dto.js';
import type { UploadedMedia } from './promotions.types.js';
import { TracksService } from './tracks.service.js';

/** Multer limits: one in-memory file, a handful of short text fields, nothing else. */
const uploadLimits = (fileSize: number) => ({ fileSize, files: 1, fields: 4, fieldSize: 1_024, parts: 6, headerPairs: 50 });

/** Billboards and Club DJ phone apps (signed-in buyers). */
@Controller({ path: 'promotions', version: '1' })
export class PromotionsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly creatives: CreativeService,
    private readonly tracks: TracksService,
  ) {}

  @Get('slots')
  slots(): Promise<BillboardSlotsDto> {
    return this.campaigns.slots();
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('creatives')
  @UseInterceptors(FileInterceptor(PROMOTION_UPLOAD_FIELD, { limits: uploadLimits(CREATIVE_MAX_BYTES) }))
  uploadCreative(@CurrentUser() user: AuthUser, @Body() body: UploadCreativeDto, @UploadedFile() file: UploadedMedia | undefined): Promise<CreativeDto> {
    return this.creatives.upload(user.userId, body.slotId, file);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('campaigns')
  createCampaign(@CurrentUser() user: AuthUser, @Body() body: CreateCampaignDto): Promise<CampaignCheckoutDto> {
    return this.campaigns.create(user, body);
  }

  @Get('campaigns')
  myCampaigns(@CurrentUser() user: AuthUser): Promise<AdCampaignDto[]> {
    return this.campaigns.listMine(user.userId);
  }

  @Delete('campaigns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelCampaign(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.campaigns.cancel(user.userId, id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('tracks')
  @UseInterceptors(FileInterceptor(PROMOTION_UPLOAD_FIELD, { limits: uploadLimits(TRACK_MAX_BYTES) }))
  uploadTrack(@CurrentUser() user: AuthUser, @Body() body: UploadTrackDto, @UploadedFile() file: UploadedMedia | undefined): Promise<ClubTrackDto> {
    return this.tracks.upload(user, body, file);
  }

  @Get('tracks')
  myTracks(@CurrentUser() user: AuthUser): Promise<ClubTrackDto[]> {
    return this.tracks.listMine(user.userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('tracks/:id/orders')
  orderRotation(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: CreateClubOrderDto): Promise<ClubOrderCheckoutDto> {
    return this.tracks.order(user, id, body);
  }
}
