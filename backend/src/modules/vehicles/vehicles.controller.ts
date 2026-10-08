import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  LicenceApplicationResultDto,
  OwnedVehicleDto,
  VehiclePurchaseResultDto,
  VehicleRepairResultDto,
  VehicleSaleResultDto,
  VehiclesDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { VehiclePurchaseDto } from './dto/vehicle-purchase.dto.js';
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
    return this.session.run({ userId: user.userId }, (ctx) => this.vehicles.purchase(ctx, body.vehicleId, body.colour), { touch: true });
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

  @Post(':id/repairs')
  repair(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<VehicleRepairResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.vehicles.repair(ctx, id), { touch: true });
  }
}
