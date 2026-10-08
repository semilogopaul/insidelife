import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import {
  KOBO_PER_NAIRA,
  TOPUP_PACKAGES,
  findTopupPackage,
  formatNaira,
  type TopupCatalogDto,
  type TopupStartedDto,
  type TopupVerificationDto,
} from '@insidelife/shared';
import type { CheckoutFulfiller, CheckoutRequest, PaidCheckout } from '../../common/ports/checkout.port.js';
import {
  DomainException,
  GameRuleException,
  NoCharacterException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { UsersService } from '../users/users.service.js';
import { startOfUtcDay } from './checkout-rules.js';
import { CheckoutService } from './checkout.service.js';
import { toPaymentDto } from './payment.mapper.js';
import { TopupCreditor } from './topup-creditor.service.js';


/**
 * Paystack top-ups: real naira buy in-game naira (flagged *purchased*). Starting a checkout enforces the daily
 * real-money cap atomically (per-user advisory lock in the checkout transaction); delivery is this module's
 * `topup` fulfiller, which credits `ctx.wallet.receive(…, 'topup:<reference>', { income: 'purchased' })` — the
 * ledger idempotency key makes a second delivery of the same reference a no-op even if verify and webhook race.
 */
@Injectable()
export class TopupsService implements CheckoutFulfiller, OnModuleInit {
  readonly purpose = 'topup' as const;
  private readonly logger = new Logger(TopupsService.name);
  private readonly dailyLimitKobo: number;

  constructor(
    private readonly checkout: CheckoutService,
    private readonly creditor: TopupCreditor,
    private readonly directory: CharacterDirectory,
    private readonly users: UsersService,
    private readonly ledger: LedgerService,
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<AppConfig, true>,
  ) {
    this.dailyLimitKobo = config.get('paystack', { infer: true }).dailyLimitNgn * KOBO_PER_NAIRA;
  }

  onModuleInit(): void {
    this.checkout.registerFulfiller(this);
  }

  async catalog(userId: string): Promise<TopupCatalogDto> {
    const spentKobo = await this.checkout.committedKoboSince(this.dataSource.manager, userId, 'topup', startOfUtcDay(new Date()));
    return {
      packages: TOPUP_PACKAGES,
      dailyLimitNgn: this.dailyLimitKobo / KOBO_PER_NAIRA,
      spentTodayNgn: spentKobo / KOBO_PER_NAIRA,
      remainingTodayNgn: Math.max(0, this.dailyLimitKobo - spentKobo) / KOBO_PER_NAIRA,
      sandbox: this.checkout.sandbox,
    };
  }

  async start(userId: string, packageId: string): Promise<TopupStartedDto> {
    const pack = findTopupPackage(packageId);
    if (!pack) throw new ResourceNotFoundException('Top-up package');
    const character = await this.directory.findLivingByUser(userId);
    if (!character) throw new NoCharacterException();
    const user = await this.users.findById(userId);
    if (!user) throw new ResourceNotFoundException('Account');

    const session = await this.checkout.start(
      {
        userId,
        email: user.email,
        characterId: character.id,
        purpose: 'topup',
        amountKobo: pack.priceNgn * KOBO_PER_NAIRA,
        description: `Inside Life top-up: ${pack.label}`,
        subjectId: pack.id,
      },
      (manager, request) => this.enforceDailyCap(manager, request),
    );
    return { ...session, sandbox: this.checkout.sandbox, package: pack };
  }

  async verify(userId: string, reference: string): Promise<TopupVerificationDto> {
    const { payment, fulfilledNow } = await this.checkout.verify(userId, reference);
    if (payment.purpose !== 'topup') throw new ResourceNotFoundException('Top-up');
    let balance: number | null = null;
    if (payment.fulfilledAt) {
      const character = await this.directory.findLivingByUser(userId);
      if (character) balance = (await this.ledger.balances(this.dataSource.manager, character.id)).cash;
    }
    return { payment: toPaymentDto(payment), fulfilledNow, balance };
  }

  /** Checkout fulfiller for `topup`. Throws (→ retried later) when the purchase can't be delivered yet. */
  async fulfill(payment: PaidCheckout): Promise<void> {
    const pack = findTopupPackage(payment.subjectId);
    if (!pack) throw new DomainException('TOPUP_PACKAGE_UNKNOWN', `Unknown top-up package ${payment.subjectId}`);
    if (payment.amountKobo !== pack.priceNgn * KOBO_PER_NAIRA) {
      throw new DomainException('TOPUP_AMOUNT_MISMATCH', 'Paid amount does not match the package price');
    }
    const characterId = await this.recipientFor(payment);
    await this.creditor.credit(characterId, pack, payment.reference);
    this.logger.log({ reference: payment.reference, packageId: pack.id }, 'Top-up credited');
  }

  /** The character that paid, or the account's living heir if they've since died. */
  private async recipientFor(payment: PaidCheckout): Promise<string> {
    if (payment.characterId) {
      const original = await this.directory.findById(payment.characterId);
      if (original?.alive) return original.id;
    }
    const living = await this.directory.findLivingByUser(payment.userId);
    if (!living) throw new NoCharacterException();
    return living.id;
  }

  private async enforceDailyCap(manager: EntityManager, request: CheckoutRequest): Promise<void> {
    const committed = await this.checkout.committedKoboSince(manager, request.userId, 'topup', startOfUtcDay(new Date()));
    if (committed + request.amountKobo > this.dailyLimitKobo) {
      const remaining = Math.max(0, this.dailyLimitKobo - committed) / KOBO_PER_NAIRA;
      throw new GameRuleException(
        'TOPUP_DAILY_LIMIT',
        `Top-ups are capped at ${formatNaira(this.dailyLimitKobo / KOBO_PER_NAIRA)} a day. You have ${formatNaira(remaining)} left today.`,
      );
    }
  }
}
