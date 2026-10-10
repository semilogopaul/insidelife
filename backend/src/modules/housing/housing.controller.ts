import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type {
  BuyHouseResultDto,
  HouseListingDto,
  HousingActionResultDto,
  HousingOverviewDto,
  LandOfferDto,
  RentalListingDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { BuyHouseDto, HouseListingsQueryDto } from './dto/houses.dto.js';
import { DecorMakeoverDto, ExteriorMakeoverDto } from './dto/makeover.dto.js';
import { BuyLandDto, LandQueryDto, StartConstructionDto, TenancyDto } from './dto/property.dto.js';
import { ListingsQueryDto, MoveHomeDto, SignLeaseDto } from './dto/rentals.dto.js';
import { HousingService } from './housing.service.js';

/** The Homes app: where you live, rentals, land, building and your property portfolio. */
@Controller({ path: 'housing', version: '1' })
export class HousingController {
  constructor(
    private readonly session: CharacterSession,
    private readonly housing: HousingService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<HousingOverviewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.housing.overview(ctx));
  }

  @Get('listings')
  listings(@CurrentUser() user: AuthUser, @Query() query: ListingsQueryDto): Promise<RentalListingDto[]> {
    return this.session.run({ userId: user.userId }, async (ctx) => this.housing.listings(ctx, query));
  }

  @Post('leases')
  signLease(@CurrentUser() user: AuthUser, @Body() body: SignLeaseDto): Promise<HousingActionResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('lease', idempotencyKey, request, () => this.housing.signLease(ctx, request.listingId)),
      { touch: true },
    );
  }

  @Post('moves')
  move(@CurrentUser() user: AuthUser, @Body() body: MoveHomeDto): Promise<HousingActionResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.housing.move(ctx, body.to.toLowerCase()), { touch: true });
  }

  @Get('land')
  land(@CurrentUser() user: AuthUser, @Query() query: LandQueryDto): Promise<LandOfferDto[]> {
    return this.session.run({ userId: user.userId }, async (ctx) => this.housing.landOffers(ctx, query.districtId));
  }

  @Post('land')
  buyLand(@CurrentUser() user: AuthUser, @Body() body: BuyLandDto): Promise<HousingActionResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('land', idempotencyKey, request, () => this.housing.buyLand(ctx, request)), {
      touch: true,
    });
  }

  @Post('properties/:id/title-perfections')
  perfectTitle(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<HousingActionResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.housing.perfectTitle(ctx, id), { touch: true });
  }

  @Post('properties/:id/constructions')
  startConstruction(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StartConstructionDto,
  ): Promise<HousingActionResultDto> {
    return this.session.run(
      { userId: user.userId },
      (ctx) => this.housing.startConstruction(ctx, id, body.blueprintId, body.payment ?? 'milestones'),
      { touch: true },
    );
  }

  @Post('properties/:id/tenancy')
  tenancy(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: TenancyDto): Promise<HousingActionResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.housing.setTenancy(ctx, id, body.action), { touch: true });
  }

  @Post('properties/:id/sale')
  listForSale(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<HousingActionResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.housing.listForSale(ctx, id), { touch: true });
  }

  @Delete('properties/:id/sale')
  cancelSale(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<HousingActionResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.housing.cancelSale(ctx, id), { touch: true });
  }

  // ----- Houses for sale (ready-built) ------------------------------------------------------------------------------

  @Get('houses')
  houses(@CurrentUser() user: AuthUser, @Query() query: HouseListingsQueryDto): Promise<HouseListingDto[]> {
    return this.session.run({ userId: user.userId }, (ctx) => this.housing.houseListings(ctx, query.districtId));
  }

  @Post('houses')
  buyHouse(@CurrentUser() user: AuthUser, @Body() body: BuyHouseDto): Promise<BuyHouseResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('house', idempotencyKey, request, () => this.housing.buyHouse(ctx, request.listingId)),
      { touch: true },
    );
  }

  // ----- Makeovers (paint, roof, gate, floors) -----------------------------------------------------------------------

  /** Paint, re-roof, recolour the gate or rename a finished house you own. */
  @Post('properties/:id/makeovers')
  restyle(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ExteriorMakeoverDto): Promise<HousingActionResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('exterior-makeover', idempotencyKey, { propertyId: id, ...request }, () => this.housing.restyleHouse(ctx, id, request)),
      { touch: true },
    );
  }

  /** Repaint inside or lay a new floor where you live (rented or owned). */
  @Post('makeovers')
  redecorate(@CurrentUser() user: AuthUser, @Body() body: DecorMakeoverDto): Promise<HousingActionResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('decor-makeover', idempotencyKey, request, () => this.housing.redecorate(ctx, request)),
      { touch: true },
    );
  }
}
