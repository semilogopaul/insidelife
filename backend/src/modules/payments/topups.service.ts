import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import {
  KOBO_PER_NAIRA,
  TOPUP_MIN_NGN,
  TOPUP_MIN_USD,
  TOPUP_PACKAGES,
  TOPUP_USD_QUICK_PICKS,
  formatNaira,
  formatPaymentAmount,
  type CreateTopupRequest,
  type TopupUsdCatalogDto,
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
import { UsdRateService } from './usd-rate.service.js';

/** The player saw another ₦ per $1 than the one in force now: show them the new one rather than charge differently. */
export class TopupRateChangedException extends DomainException {
  constructor(ngnPerUsd: number) {
    super('RATE_CHANGED', `The dollar rate just changed to ${formatNaira(ngnPerUsd)} per $1. Check what you get and pay again`, HttpStatus.CONFLICT);
  }
}

/**
 * Top-ups: real naira or US dollars (Flutterwave) buy in-game naira (flagged *purchased*). A player picks a pack or
 * types any whole amount from ₦500 to the configured maximum, or (when dollars are on) any whole amount from $1 to the
 * dollar maximum; the server quotes the rate (the largest pack the naira value reaches, the dollar amount converted at
 * the owner's ₦ per $1) and stores both rates on the payment. Delivery is this module's `topup` fulfiller: it credits the amount Flutterwave verified
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
  private readonly maxUsd: number;

  constructor(
    private readonly checkout: CheckoutService,
    private readonly creditor: TopupCreditor,
    private readonly directory: CharacterDirectory,
    private readonly users: UsersService,
    private readonly ledger: LedgerService,
    private readonly usdRate: UsdRateService,
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<AppConfig, true>,
  ) {
    const payments = config.get('payments', { infer: true });
    this.dailyLimitKobo = Math.max(0, payments.dailyLimitNgn) * KOBO_PER_NAIRA;
    this.maxNgn = payments.maxTopupNgn;
    this.maxUsd = payments.usd.maxTopupUsd;
  }

  onModuleInit(): void {
    this.checkout.registerFulfiller(this);
  }

  async catalog(userId: string): Promise<TopupCatalogDto> {
    const spentKobo = await this.checkout.committedKoboSince(this.dataSource.manager, userId, 'topup', startOfUtcDay(new Date()));
    const capped = this.dailyLimitKobo > 0;
    const usdOptions = await this.usdRate.options();
    const usd: TopupUsdCatalogDto | null = usdOptions
      ? {
          ...usdOptions,
          minUsd: TOPUP_MIN_USD,
          maxPerPaymentUsd: this.maxUsd,
          quickPicksUsd: TOPUP_USD_QUICK_PICKS.filter((dollars) => dollars <= this.maxUsd),
        }
      : null;
    return {
      packages: TOPUP_PACKAGES.filter((pack) => pack.priceNgn <= this.maxNgn),
      minNgn: TOPUP_MIN_NGN,
      maxPerPaymentNgn: this.maxNgn,
      dailyLimitNgn: capped ? this.dailyLimitKobo / KOBO_PER_NAIRA : null,
      spentTodayNgn: spentKobo / KOBO_PER_NAIRA,
      remainingTodayNgn: capped ? Math.max(0, this.dailyLimitKobo - spentKobo) / KOBO_PER_NAIRA : null,
      usd,
      sandbox: this.checkout.sandbox,
    };
  }

  /**
   * Start a checkout for a pack or a custom amount. The rate is quoted here and stored on the payment. `returnOrigin`:
   * the web origin the player is on (`requestOrigin`), so Flutterwave sends them back there when it is one of ours.
   */
  async start(userId: string, request: CreateTopupRequest, returnOrigin: string | null = null): Promise<TopupStartedDto> {
    const currency = request.currency ?? 'NGN';
    if (currency === 'USD' && !this.usdRate.usdEnabled) throw new GameRuleException('PAYMENT_CURRENCY_UNAVAILABLE', 'Top-ups are in naira only for now');
    if (currency === 'NGN' && request.method !== undefined && request.method !== 'card') {
      throw new GameRuleException('INVALID_TOPUP', 'Apple Pay and Google Pay are for dollar payments');
    }
    if (request.method !== undefined && !this.usdRate.methods.includes(request.method)) throw new GameRuleException('INVALID_TOPUP', 'That way to pay isn’t available');
    const ngnPerUsd = currency === 'USD' ? await this.usdRate.ngnPerUsd() : null;
    if (ngnPerUsd !== null && request.expectedNgnPerUsd !== undefined && request.expectedNgnPerUsd !== ngnPerUsd) throw new TopupRateChangedException(ngnPerUsd);
    const quoted = quoteTopup(request, { maxNgn: this.maxNgn, usd: ngnPerUsd === null ? null : { maxUsd: this.maxUsd, ngnPerUsd } });
    if (!quoted.ok) throw new GameRuleException('INVALID_TOPUP', quoted.reason);
    const { quote } = quoted;
    const price = formatPaymentAmount(quote.currency, quote.amountMinor);
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
        currency: quote.currency,
        amountMinor: quote.amountMinor,
        ...(quote.ngnPerUsd === null ? {} : { ngnPerUsd: quote.ngnPerUsd }),
        method: request.method ?? 'card',
        description: `Inside Life top-up: ${formatNaira(quote.virtualAmount)} in game (${quote.label}, ${price})`.slice(0, 120),
        subjectId: quote.subjectId,
        topupRate: quote.ratePerNaira,
        returnOrigin,
      },
      (manager, checkoutRequest) => this.enforceDailyCap(manager, checkoutRequest),
    );
    this.logger.log(
      { reference: session.reference, currency: quote.currency, amountMinor: quote.amountMinor, priceNgn: quote.priceNgn, rate: quote.ratePerNaira, ngnPerUsd: quote.ngnPerUsd },
      'Top-up checkout started',
    );
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
    this.logger.log(
      { reference: payment.reference, currency: payment.currency, paidMinor: payment.paidMinor, ngnPerUsd: payment.ngnPerUsd, rate: result.credit.ratePerNaira },
      'Top-up credited',
    );
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
    // Same currency on both sides (Flutterwave refunds in the charge's currency), so the share is exact either way.
    const share = Math.min(1, refund.amountMinor / payment.paidMinor);
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
    // Every currency counts at its naira value (dollars at the rate quoted).
    const valueKobo = request.ngnPerUsd === undefined ? request.amountMinor : request.amountMinor * request.ngnPerUsd;
    if (committed + valueKobo > this.dailyLimitKobo) {
      const remaining = Math.max(0, this.dailyLimitKobo - committed) / KOBO_PER_NAIRA;
      throw new GameRuleException(
        'TOPUP_DAILY_LIMIT',
        `Top-ups are capped at ${formatNaira(this.dailyLimitKobo / KOBO_PER_NAIRA)} a day. You have ${formatNaira(remaining)} left today.`,
      );
    }
  }
}
