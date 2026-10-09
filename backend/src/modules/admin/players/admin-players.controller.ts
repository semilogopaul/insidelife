import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Page } from '../../../common/utils/paging.js';
import { pageRequest } from '../../../common/utils/paging.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { Actor, AdminRoute, ExportThrottle } from '../common/admin.decorators.js';
import { exportFilters, sendCsv } from '../common/csv-response.js';
import { pageOfQuery } from '../common/list-query.dto.js';
import type {
  AdminLedgerEntryDto,
  AdminPlayerDetailDto,
  AdminPlayerRowDto,
  WalletAdjustmentResultDto,
} from '../interfaces/admin-players.interfaces.js';
import { AdminPlayersService } from './admin-players.service.js';
import { LedgerQueryDto, PlayerReasonDto, PlayersQueryDto, WalletAdjustmentDto } from './dto/players.dto.js';

/** Players: search, detail, and moderation actions. Every action is audited with the admin, reason, IP and trace id. */
@AdminRoute()
@Controller({ path: 'admin/players', version: '1' })
export class AdminPlayersController {
  constructor(
    private readonly players: AdminPlayersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() query: PlayersQueryDto): Promise<Page<AdminPlayerRowDto>> {
    return this.players.list(query, pageOfQuery(query));
  }

  /** Same filters as the list; up to 50,000 rows. The export itself is audited. */
  @ExportThrottle()
  @Get('export.csv')
  async export(@Query() query: PlayersQueryDto, @Actor() actor: AuditActor, @Res({ passthrough: true }) res: Response): Promise<string> {
    const { csv, rows } = await this.players.exportCsv(query);
    await this.audit.recordNow(actor, {
      action: 'export.players',
      target: { type: 'player', id: null, label: `${rows} players` },
      metadata: { rows, filters: exportFilters({ ...query, page: undefined, pageSize: undefined }) },
    });
    return sendCsv(res, 'players', csv);
  }

  @Get(':userId')
  detail(@Param('userId', new ParseUUIDPipe()) userId: string): Promise<AdminPlayerDetailDto> {
    return this.players.detail(userId);
  }

  @Get(':userId/ledger')
  ledger(@Param('userId', new ParseUUIDPipe()) userId: string, @Query() query: LedgerQueryDto): Promise<Page<AdminLedgerEntryDto>> {
    return this.players.ledger(userId, pageRequest(query.page, query.pageSize));
  }

  /** Suspend: no sign-in and no play until lifted. Ends every session now. */
  @HttpCode(HttpStatus.OK)
  @Post(':userId/suspend')
  async suspend(@Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: PlayerReasonDto, @Actor() actor: AuditActor): Promise<AdminPlayerDetailDto> {
    await this.players.suspend(actor, userId, body.reason.trim());
    return this.players.detail(userId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':userId/unsuspend')
  async unsuspend(@Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: PlayerReasonDto, @Actor() actor: AuditActor): Promise<AdminPlayerDetailDto> {
    await this.players.unsuspend(actor, userId, body.reason.trim());
    return this.players.detail(userId);
  }

  /** Soft delete (restorable within the restore window). */
  @HttpCode(HttpStatus.OK)
  @Post(':userId/delete')
  async softDelete(@Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: PlayerReasonDto, @Actor() actor: AuditActor): Promise<AdminPlayerDetailDto> {
    await this.players.softDelete(actor, userId, body.reason.trim());
    return this.players.detail(userId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':userId/restore')
  async restore(@Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: PlayerReasonDto, @Actor() actor: AuditActor): Promise<AdminPlayerDetailDto> {
    await this.players.restore(actor, userId, body.reason.trim());
    return this.players.detail(userId);
  }

  /** Credit (+) or debit (−) the player's cash through the ledger. */
  @HttpCode(HttpStatus.OK)
  @Post(':userId/wallet-adjustments')
  adjustWallet(@Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: WalletAdjustmentDto, @Actor() actor: AuditActor): Promise<WalletAdjustmentResultDto> {
    return this.players.adjustWallet(actor, userId, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':userId/reset-handle')
  async resetHandle(@Param('userId', new ParseUUIDPipe()) userId: string, @Body() body: PlayerReasonDto, @Actor() actor: AuditActor): Promise<AdminPlayerDetailDto> {
    await this.players.resetHandle(actor, userId, body.reason.trim());
    return this.players.detail(userId);
  }
}
