import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  JerrycanResultDto,
  LicenceApplicationResultDto,
  OwnedVehicleDto,
  VehiclePurchaseResultDto,
  VehicleRepairResultDto,
  VehicleSaleResultDto,
  VehicleShipmentResultDto,
  VehiclesDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { VehiclePurchaseDto } from './dto/vehicle-purchase.dto.js';
import { VehicleServiceDto } from './dto/vehicle-service.dto.js';
import { VehicleShipmentDto } from './dto/vehicle-shipment.dto.js';
import { LicenceService } from './licence.service.js';
import { VehiclesService } from './vehicles.service.js';

/** The Motors app: cars, licence, maintenance. */
@Controller({ path: 'vehicles', version: '1' })
export class VehiclesController {
  constructor(
    private readonly session: CharacterSession,
    private readonly vehicles: VehiclesService,
    private readonly licence: LicenceService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<VehiclesDto> {
    return this.session.run({ userId: user.userId }, async (ctx) => this.vehicles.view(ctx, await this.licence.status(ctx)));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('purchases')
  purchase(@CurrentUser() user: AuthUser, @Body() body: VehiclePurchaseDto): Promise<VehiclePurchaseResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('vehicle-purchase', idempotencyKey, request, () => this.vehicles.purchase(ctx, request.vehicleId, request.colour)),
      { touch: true },
    );
  }

  @Post('licence')
  applyForLicence(@CurrentUser() user: AuthUser): Promise<LicenceApplicationResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.licence.apply(ctx), { touch: true });
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/primary')
  setPrimary(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<OwnedVehicleDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.vehicles.setPrimary(ctx, id), { touch: true });
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/sale')
  sell(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<VehicleSaleResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.vehicles.sell(ctx, id), { touch: true });
  }

  /** Tow & fix: a tow truck to a workshop and a proper repair, from anywhere. */
  @Post(':id/repairs')
  repair(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<VehicleRepairResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.vehicles.repair(ctx, id), { touch: true });
  }

  /** Roadside mechanic: gets a broken-down car going again, wherever it stands (premium). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/roadside-repairs')
  roadsideRepair(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: VehicleServiceDto): Promise<VehicleRepairResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.vehicles.roadsideRepair(ctx, id, body.idempotencyKey), { touch: true });
  }

  /** A 10 L jerrycan of fuel brought to you anywhere in Lagos (premium). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/jerrycans')
  jerrycan(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: VehicleServiceDto): Promise<JerrycanResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.vehicles.jerrycan(ctx, id, body.idempotencyKey), { touch: true });
  }

  /** A car carrier takes the car to the other city (fee, ~2 game days). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/shipments')
  ship(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: VehicleShipmentDto): Promise<VehicleShipmentResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('vehicle-shipment', body.idempotencyKey, { id }, () => this.vehicles.ship(ctx, id, body.idempotencyKey)), { touch: true });
  }
}
