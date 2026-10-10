import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import {
  KOBO_PER_NAIRA,
  TOPUP_MIN_NGN,
  TOPUP_PACKAGES,
  formatNaira,
  type CreateTopupRequest,
  type TopupCatalogDto,
  type TopupStartedDto,
  type TopupVerificationDto,
} from '@insidelife/shared';
import type { CheckoutFulfiller, CheckoutRefund, CheckoutRequest, FulfilmentResult, PaidCheckout } from '../../common/ports/checkout.port.js';
import { DomainException, GameRuleException, NoCharacterException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { UsersService } from '../users/users.service.js';
import { startOfUtcDay } from './checkout-rules.js';
import { CheckoutService } from './checkout.service.js';
import { toPaymentDto } from './payment.mapper.js';
import { TopupCreditor } from './topup-creditor.service.js';
import { quoteTopup, topupCredit } from './topup-quote.js';

/**
 * Top-ups: real naira (Flutterwave) buy in-game naira (flagged *purchased*). A player picks a pack or types any whole
 * amount from ₦500 to the configured maximum; the server quotes the rate (the largest pack the amount reaches) and
 * stores it on the payment. Delivery is this module's `topup` fulfiller: it credits the amount Flutterwave verified
 * × that stored rate via `ctx.wallet.receive(…, 'topup:<reference>', { income: 'purchased' })` — the ledger
 * idempotency key makes a second delivery of the same reference a no-op even if verify and webhook race.
 *
 * There is no daily cap by default (TOPUP_DAILY_LIMIT_NGN=0). When the owner sets one, starting a checkout enforces
 * it atomically (per-user advisory lock in the checkout transaction).
 */
@Injectable()
export class TopupsService implements CheckoutFulfiller, OnModuleInit {
  readonly purpose = 'topup' as const;
  private readonly logger = new Logger(TopupsService.name);
  /** 0 = no daily cap. */
  private readonly dailyLimitKobo: number;
  private readonly maxNgn: number;

  constructor(
    private readonly checkout: CheckoutService,
    private readonly creditor: TopupCreditor,
    private readonly directory: CharacterDirectory,
    private readonly users: UsersService,
    private readonly ledger: LedgerService,
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<AppConfig, true>,
  ) {
    const payments = config.get('payments', { infer: true });
    this.dailyLimitKobo = Math.max(0, payments.dailyLimitNgn) * KOBO_PER_NAIRA;
    this.maxNgn = payments.maxTopupNgn;
  }

  onModuleInit(): void {
    this.checkout.registerFulfiller(this);
  }

  async catalog(userId: string): Promise<TopupCatalogDto> {
    const spentKobo = await this.checkout.committedKoboSince(this.dataSource.manager, userId, 'topup', startOfUtcDay(new Date()));
    const capped = this.dailyLimitKobo > 0;
    return {
      packages: TOPUP_PACKAGES.filter((pack) => pack.priceNgn <= this.maxNgn),
      minNgn: TOPUP_MIN_NGN,
      maxPerPaymentNgn: this.maxNgn,
      dailyLimitNgn: capped ? this.dailyLimitKobo / KOBO_PER_NAIRA : null,
      spentTodayNgn: spentKobo / KOBO_PER_NAIRA,
      remainingTodayNgn: capped ? Math.max(0, this.dailyLimitKobo - spentKobo) / KOBO_PER_NAIRA : null,
      sandbox: this.checkout.sandbox,
    };
  }

  /**
   * Start a checkout for a pack or a custom amount. The rate is quoted here and stored on the payment. `returnOrigin`:
   * the web origin the player is on (`requestOrigin`), so Flutterwave sends them back there when it is one of ours.
   */
  async start(userId: string, request: CreateTopupRequest, returnOrigin: string | null = null): Promise<TopupStartedDto> {
    const quoted = quoteTopup(request, this.maxNgn);
    if (!quoted.ok) throw new GameRuleException('INVALID_TOPUP', quoted.reason);
    const { quote } = quoted;
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
        amountKobo: quote.priceNgn * KOBO_PER_NAIRA,
        description: `Inside Life top-up: ${formatNaira(quote.virtualAmount)} in game (${quote.label})`.slice(0, 120),
        subjectId: quote.subjectId,
        topupRate: quote.ratePerNaira,
        returnOrigin,
      },
      (manager, checkoutRequest) => this.enforceDailyCap(manager, checkoutRequest),
    );
    this.logger.log({ reference: session.reference, priceNgn: quote.priceNgn, rate: quote.ratePerNaira }, 'Top-up checkout started');
    const { subjectId: _subject, ...topup } = quote;
    return { ...session, sandbox: this.checkout.sandbox, topup };
  }

  async verify(userId: string, reference: string, transactionId?: string): Promise<TopupVerificationDto> {
    const { payment, fulfilledNow } = await this.checkout.verify(userId, reference, transactionId);
    if (payment.purpose !== 'topup') throw new ResourceNotFoundException('Top-up');
    let balance: number | null = null;
    if (payment.fulfilledAt) {
      const character = await this.directory.findLivingByUser(userId);
      if (character) balance = (await this.ledger.balances(this.dataSource.manager, character.id)).cash;
    }
    return { payment: toPaymentDto(payment), fulfilledNow, balance };
  }

  /** Checkout fulfiller for `topup`: credits the verified amount × the stored rate. Throws (→ retried later) on failure. */
  async fulfill(payment: PaidCheckout): Promise<FulfilmentResult> {
    const result = topupCredit(payment);
    if (!result.ok) throw new DomainException('TOPUP_UNDELIVERABLE', result.reason);
    const characterId = await this.recipientFor(payment);
    await this.creditor.credit(characterId, result.credit, payment.reference);
    this.logger.log({ reference: payment.reference, paidKobo: payment.paidKobo, rate: result.credit.ratePerNaira }, 'Top-up credited');
    return { kind: 'delivered' };
  }

  /**
   * The real payment was refunded (from the Flutterwave dashboard — we never refund top-ups ourselves). If the coins
   * were delivered, take back the refunded share as far as the wallet allows and flag the payment either way.
   */
  async onRefunded(payment: PaidCheckout, refund: CheckoutRefund): Promise<void> {
    const result = topupCredit(payment);
    if (!result.ok || !refund.delivered) {
      await this.checkout.flag(payment.reference, 'Top-up refunded before delivery: no coins were credited');
      return;
    }
    // Each refund takes back its own share (a second partial refund takes the rest); keyed by refund id, never twice.
    const share = Math.min(1, refund.amountKobo / payment.paidKobo);
    const owed = Math.ceil(result.credit.virtualAmount * share);
    const { taken, shortfall } = await this.creditor.clawBack(await this.recipientFor(payment), result.credit, owed, payment.reference, refund.refundId);
    const summary = `Top-up refunded after delivery (refund ${refund.refundId}): clawed back ${formatNaira(taken)} of ${formatNaira(owed)}`;
    await this.checkout.flag(payment.reference, shortfall > 0 ? `${summary} (${formatNaira(shortfall)} already spent)` : summary);
  }

  /**
   * A refund of a top-up failed at Flutterwave after it had been reported completed (and the coins taken back). The
   * player keeps neither the money nor the coins until ops act, so flag it; if the refund completes after all, its
   * clawback key is already used and nothing is taken twice.
   */
  async onRefundFailed(payment: PaidCheckout, refund: CheckoutRefund, wasCompleted: boolean): Promise<void> {
    if (!wasCompleted) return;
    await this.checkout.flag(payment.reference, `Refund ${refund.refundId} failed after the coins were taken back: refund it again by hand or re-credit the coins`);
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
    if (this.dailyLimitKobo <= 0) return;
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
