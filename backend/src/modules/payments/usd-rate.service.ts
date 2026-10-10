import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  DEFAULT_USD_RATE_NGN,
  KOBO_PER_NAIRA,
  USD_MIN_CHARGE_CENTS,
  USD_RATE_KEY,
  WALLET_PAYMENT_METHODS,
  isValidUsdRateNgn,
  type PaymentMethod,
  type UsdPaymentOptionsDto,
} from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';

/** Safety net when a change notice is missed: re-read the rate at least this often. */
const RATE_TTL_MS = 30_000;

/**
 * The exchange rate dollar payments use: "₦ per $1 for payments", the `usd-rate` entry of the owner's rate card
 * (`ad_rates`, edited through the audited admin ad-rates route; the promotions module writes it and calls
 * `invalidate()` on every node when it changes). No row → ₦1,500. A stored value outside ₦500–₦5,000 is ignored (the
 * default applies) rather than trusted. Every dollar checkout snapshots the rate it was quoted at, so a change only
 * affects new checkouts.
 */
@Injectable()
export class UsdRateService {
  private readonly logger = new Logger(UsdRateService.name);
  private readonly enabled: boolean;
  private readonly wallets: boolean;
  private cached: { readonly value: number; readonly at: number } | null = null;
  private loading: Promise<number> | null = null;
  /** Bumped on every change notice, so a read that started before the change never caches the old rate. */
  private generation = 0;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<AppConfig, true>,
  ) {
    const { usd } = config.get('payments', { infer: true });
    this.enabled = usd.enabled;
    this.wallets = usd.enabled && usd.wallets;
  }

  /** Does this server take dollars (PAYMENTS_USD_ENABLED)? */
  get usdEnabled(): boolean {
    return this.enabled;
  }

  /** Dollar methods offered: card always, wallets when enabled. */
  get methods(): readonly PaymentMethod[] {
    return this.wallets ? ['card', ...WALLET_PAYMENT_METHODS] : ['card'];
  }

  /** Current ₦ per $1 (whole naira). */
  async ngnPerUsd(): Promise<number> {
    if (this.cached && Date.now() - this.cached.at < RATE_TTL_MS) return this.cached.value;
    if (!this.loading) {
      const loading = this.load().finally(() => {
        if (this.loading === loading) this.loading = null;
      });
      this.loading = loading;
    }
    return this.loading;
  }

  /** What clients are offered for paying in dollars, or null when the server takes naira only. */
  async options(): Promise<UsdPaymentOptionsDto | null> {
    if (!this.enabled) return null;
    return { ngnPerUsd: await this.ngnPerUsd(), methods: this.methods, minChargeCents: USD_MIN_CHARGE_CENTS };
  }

  /** The rate changed (this node or another): read it again on the next quote. */
  invalidate(): void {
    this.generation += 1;
    this.cached = null;
    this.loading = null;
  }

  private async load(): Promise<number> {
    const generation = this.generation;
    const rows = await this.dataSource.query<Array<{ price_kobo: string }>>(`SELECT price_kobo FROM ad_rates WHERE key = $1`, [USD_RATE_KEY]);
    const stored = rows[0] ? Number(rows[0].price_kobo) / KOBO_PER_NAIRA : null;
    let value = DEFAULT_USD_RATE_NGN;
    if (stored !== null) {
      if (isValidUsdRateNgn(stored)) value = stored;
      else this.logger.error({ stored }, 'Stored ₦ per $1 rate is out of range; using the default');
    }
    if (generation === this.generation) this.cached = { value, at: Date.now() };
    return value;
  }
}
