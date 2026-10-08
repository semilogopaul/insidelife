import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { LedgerEntryDto, Paginated, TransferResultDto, WalletDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { SavingsTransferDto, StatementQueryDto, TransferDto } from './dto/wallet.dto.js';
import { TransfersService } from './transfers.service.js';
import { WalletService } from './wallet.service.js';

const DEFAULT_STATEMENT_PAGE = 30;

@Controller({ path: 'wallet', version: '1' })
export class WalletController {
  constructor(
    private readonly session: CharacterSession,
    private readonly wallets: WalletService,
  ) {}

  @Get()
  wallet(@CurrentUser() user: AuthUser): Promise<WalletDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.wallets.wallet(ctx));
  }

  @Get('statement')
  statement(@CurrentUser() user: AuthUser, @Query() query: StatementQueryDto): Promise<Paginated<LedgerEntryDto>> {
    return this.wallets.statement(user.userId, query.cursor ?? null, query.limit ?? DEFAULT_STATEMENT_PAGE);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('savings-transfers')
  moveSavings(@CurrentUser() user: AuthUser, @Body() body: SavingsTransferDto): Promise<WalletDto> {
    return this.session.run(
      { userId: user.userId },
      (ctx) => this.wallets.moveSavings(ctx, body.direction, body.amount, body.idempotencyKey),
      { touch: true },
    );
  }
}

@Controller({ path: 'transfers', version: '1' })
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  send(@CurrentUser() user: AuthUser, @Body() body: TransferDto): Promise<TransferResultDto> {
    return this.transfers.send(user.userId, body);
  }
}
