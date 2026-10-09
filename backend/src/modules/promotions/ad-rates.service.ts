import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import type { Repository } from 'typeorm';
import {
  AD_RATE_DEFINITIONS,
  AD_RATE_KEYS,
  AD_MAX_PRICE_KOBO,
  AD_MIN_PRICE_KOBO,
  adRateKeyOf,
  adWeekPriceKobo,
  formatNaira,
  isAdRateKey,
  isValidAdPriceKobo,
  koboToNaira,
  type AdRateDto,
  type AdRateKey,
  type AdSlot,
} from '@insidelife/shared';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { REDIS } from '../../common/redis/redis.module.js';
import { AdRateEntity } from './entities/ad-rate.entity.js';
import { PromotionRuleException } from './promotions.errors.js';
import { CachedValue } from './util/cached-value.js';

/** Every API node subscribes; a rate change is published here so all of them reload at once. */
export const AD_RATES_CHANNEL = 'promotions:ad-rates';
/** Safety net if a publish is missed (Redis blip): nodes re-read the table at least this often. */
const RATES_TTL_MS = 30_000;
const REASON_MAX = 300;

type Overrides = ReadonlyMap<AdRateKey, AdRateEntity>;

/** Current prices, resolved once for a batch (e.g. the ~560 slots of the slots endpoint). */
export interface AdPricing {
  /** Current price of one 7-day block on this slot (rate override or catalog default, district-scaled). */
  weekPriceKobo(slot: Pick<AdSlot, 'id' | 'kind' | 'districtId'>): number;
  /** Current price of one club song. */
  readonly songPriceKobo: number;
}

/**
 * The ad price list. Defaults come from the shared catalog (`AD_RATE_DEFINITIONS`); a row in `ad_rates` overrides
 * one rate. Every quote and checkout reads prices here, and each order stores the amount it was quoted, so changing a
 * rate never touches a paid or pending order. Cached per node with a short TTL and invalidated on every node through
 * Redis pub/sub, so all nodes quote the new price within a second of a change.
 */
@Injectable()
export class AdRatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdRatesService.name);
  private readonly overrides = new CachedValue<Overrides>(RATES_TTL_MS, () => this.load());
  private readonly listeners = new Set<() => void>();
  private subscriber: Redis | null = null;

  constructor(
    @InjectRepository(AdRateEntity) private readonly rates: Repository<AdRateEntity>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const subscriber = this.redis.duplicate();
      subscriber.on('message', (channel: string) => {
        if (channel === AD_RATES_CHANNEL) this.changed();
      });
      subscriber.on('error', (error: Error) => this.logger.warn(`Ad rates subscriber: ${error.message}`));
      await subscriber.subscribe(AD_RATES_CHANNEL);
      this.subscriber = subscriber;
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not subscribe to ad rate changes; relying on the cache TTL');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
  }

  /** Run `listener` whenever rates change on any node (e.g. to refresh a cached feed that shows prices). */
  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  /** Every rate with its default and current value (for the admin price list). */
  async list(): Promise<AdRateDto[]> {
    const overrides = await this.overrides.get();
    return AD_RATE_KEYS.map((key) => this.toDto(key, overrides.get(key)));
  }

  /** Current price for a rate key, in kobo. */
  async rateKobo(key: AdRateKey): Promise<number> {
    return (await this.overrides.get()).get(key)?.priceKobo ?? AD_RATE_DEFINITIONS[key].defaultKobo;
  }

  async pricing(): Promise<AdPricing> {
    const overrides = await this.overrides.get();
    const rate = (key: AdRateKey): number => overrides.get(key)?.priceKobo ?? AD_RATE_DEFINITIONS[key].defaultKobo;
    return {
      weekPriceKobo: (slot) => adWeekPriceKobo(slot, rate(adRateKeyOf(slot))),
      songPriceKobo: rate('club-song'),
    };
  }

  /**
   * Set a rate (whole naira, ₦2,000 – ₦100m). Applies to new quotes on every node within a second; existing orders
   * keep their price. Knows nothing about who may call it: the admin route checks roles and writes the audit log.
   */
  async setRate(key: string, priceKobo: number, actorUserId: string | null, reason?: string): Promise<AdRateDto> {
    const rateKey = this.requireKey(key);
    if (!isValidAdPriceKobo(priceKobo)) {
      throw new PromotionRuleException(
        'INVALID_RATE',
        `Rates are whole naira from ${formatNaira(koboToNaira(AD_MIN_PRICE_KOBO))} to ${formatNaira(koboToNaira(AD_MAX_PRICE_KOBO))}`,
      );
    }
    const saved = await this.rates.save(
      this.rates.create({ key: rateKey, priceKobo, updatedBy: actorUserId, reason: reason?.trim().slice(0, REASON_MAX) || null }),
    );
    this.logger.log({ key: rateKey, priceKobo, actorUserId }, 'Ad rate changed');
    await this.broadcast();
    return this.toDto(rateKey, saved);
  }

  /** Drop the override: the catalog default applies again. */
  async resetRate(key: string): Promise<AdRateDto> {
    const rateKey = this.requireKey(key);
    await this.rates.delete({ key: rateKey });
    this.logger.log({ key: rateKey }, 'Ad rate reset to the default');
    await this.broadcast();
    return this.toDto(rateKey, undefined);
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private requireKey(key: string): AdRateKey {
    if (!isAdRateKey(key)) throw new ResourceNotFoundException('Ad rate');
    return key;
  }

  private async load(): Promise<Overrides> {
    const rows = await this.rates.find();
    return new Map(rows.filter((row) => isAdRateKey(row.key) && isValidAdPriceKobo(row.priceKobo)).map((row) => [row.key, row]));
  }

  /** This node at once; every other node through pub/sub (a failed publish still reaches them within the TTL). */
  private async broadcast(): Promise<void> {
    this.changed();
    try {
      await this.redis.publish(AD_RATES_CHANNEL, String(Date.now()));
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not publish an ad rate change; other nodes pick it up within 30 s');
    }
  }

  private changed(): void {
    this.overrides.invalidate();
    for (const listener of this.listeners) listener();
  }

  private toDto(key: AdRateKey, override: AdRateEntity | undefined): AdRateDto {
    const definition = AD_RATE_DEFINITIONS[key];
    return {
      key,
      label: definition.label,
      unit: definition.unit,
      byDistrict: definition.byDistrict,
      defaultKobo: definition.defaultKobo,
      currentKobo: override?.priceKobo ?? definition.defaultKobo,
      updatedAt: override?.updatedAt?.toISOString() ?? null,
      updatedBy: override?.updatedBy ?? null,
    };
  }
}
