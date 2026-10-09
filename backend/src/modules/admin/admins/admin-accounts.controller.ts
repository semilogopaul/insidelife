import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuditActor } from '../../audit/audit.types.js';
import { Actor, AdminRoute } from '../common/admin.decorators.js';
import { AdminAccountsService, type AdminAccountDto } from './admin-accounts.service.js';

export class AdminReasonBodyDto {
  @IsString()
  @MinLength(5, { message: 'Give a reason (at least 5 characters)' })
  @MaxLength(500)
  readonly reason: string;
}

export class GrantAdminDto extends AdminReasonBodyDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter the email of an existing account' })
  @MaxLength(254)
  readonly email: string;
}

/** Who can use the portal, with their authenticator and session status. */
@AdminRoute()
@Controller({ path: 'admin/admins', version: '1' })
export class AdminAccountsController {
  constructor(private readonly admins: AdminAccountsService) {}

  @Get()
  list(): Promise<readonly AdminAccountDto[]> {
    return this.admins.list();
  }

  @Post()
  grant(@Actor() actor: AuditActor, @Body() body: GrantAdminDto): Promise<readonly AdminAccountDto[]> {
    return this.admins.grant(actor, body.email, body.reason.trim());
  }

  @HttpCode(HttpStatus.OK)
  @Post(':userId/revoke')
  revoke(@Actor() actor: AuditActor, @Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: AdminReasonBodyDto): Promise<readonly AdminAccountDto[]> {
    return this.admins.revoke(actor, userId, body.reason.trim());
  }

  @HttpCode(HttpStatus.OK)
  @Post(':userId/reset-mfa')
  resetMfa(@Actor() actor: AuditActor, @Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: AdminReasonBodyDto): Promise<readonly AdminAccountDto[]> {
    return this.admins.resetMfa(actor, userId, body.reason.trim());
  }

  @HttpCode(HttpStatus.OK)
  @Post(':userId/sign-out')
  signOut(@Actor() actor: AuditActor, @Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: AdminReasonBodyDto): Promise<readonly AdminAccountDto[]> {
    return this.admins.signOutEverywhere(actor, userId, body.reason.trim());
  }
}
