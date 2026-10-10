import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import type { EntityManager, Repository } from 'typeorm';
import {
  AD_RATE_DEFINITIONS,
  AD_RATE_KEYS,
  AD_MAX_PRICE_KOBO,
  AD_MIN_PRICE_KOBO,
  AD_WEEK_DAYS,
  USD_RATE_DEFINITION,
  USD_RATE_KEY,
  USD_RATE_MAX_KOBO,
  RATE_CARD_MIN_KOBO,
  adBlockDays,
  adBlockPriceKobo,
  adRateKeyOf,
  adRateSummary,
  adWeekPriceKobo,
  formatNaira,
  isRateCardKey,
  isValidAdPriceKobo,
  isValidUsdRateKobo,
  koboToNaira,
  type AdRateDto,
  type AdRateKey,
  type AdSlot,
  type RateCardKey,
} from '@insidelife/shared';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { REDIS } from '../../common/redis/redis.module.js';
import { UsdRateService } from '../payments/usd-rate.service.js';
import { AdRateEntity } from './entities/ad-rate.entity.js';
import { PromotionRuleException } from './promotions.errors.js';
import { CachedValue } from './util/cached-value.js';

/** Every API node subscribes; a rate change is published here so all of them reload at once. */
export const AD_RATES_CHANNEL = 'promotions:ad-rates';
/** Safety net if a publish is missed (Redis blip): nodes re-read the table at least this often. */
const RATES_TTL_MS = 30_000;
const REASON_MAX = 300;

type Overrides = ReadonlyMap<RateCardKey, AdRateEntity>;

/** Is `kobo` a value the rate-card entry `key` can take (ad prices ₦2,000–₦100m, the exchange rate ₦500–₦5,000 per $1)? */
const isValidRateKobo = (key: RateCardKey, kobo: number): boolean => (key === USD_RATE_KEY ? isValidUsdRateKobo(kobo) : isValidAdPriceKobo(kobo));

/** A slot's current price as sold: its weekly rate, the block length that rate implies, and one block's price. */
export interface SlotBlockPrice {
  readonly weekPriceKobo: number;
  readonly blockDays: number;
  readonly blockPriceKobo: number;
}

/**
 * Runs inside the price change's transaction, after the change is saved (the admin API writes its audit entry here):
 * throwing rolls the change back, so a price never changes without its audit entry.
 */
export type AdRateHook = (manager: EntityManager, rate: AdRateDto) => Promise<void>;

/** Current prices, resolved once for a batch (e.g. the ~560 slots of the slots endpoint). */
export interface AdPricing {
  /** Current weekly rate on this slot (rate override or catalog default, district-scaled). */
  weekPriceKobo(slot: Pick<AdSlot, 'id' | 'kind' | 'districtId'>): number;
  /** The weekly rate with the block it's sold in (3 days from ₦35,000 a week, else 7: `adBlockDays`; songs always 7). */
  block(slot: Pick<AdSlot, 'id' | 'kind' | 'districtId'>): SlotBlockPrice;
  /** Current price of one week of a club song (always sold by the week). */
  readonly songPriceKobo: number;
}

/** The block a weekly rate is sold in. */
export function blockPriceOf(weekPriceKobo: number): SlotBlockPrice {
  const blockDays = adBlockDays(weekPriceKobo);
  return { weekPriceKobo, blockDays, blockPriceKobo: adBlockPriceKobo(weekPriceKobo, blockDays) };
}

/**
 * The ad price list, which is also the owner's rate card: it carries the exchange rate dollar payments use
 * (`usd-rate`, ₦ per $1, read by the payments module's `UsdRateService`, which this service tells on every node when it
 * changes). Defaults come from the shared catalog (`AD_RATE_DEFINITIONS`, `USD_RATE_DEFINITION`); a row in `ad_rates`
 * overrides one rate. Every quote and checkout reads prices here, and each order stores the amount it was quoted, so changing a
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
    private readonly usdRate: UsdRateService,
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

  /** Every rate with its default and current value (for the admin price list), the exchange rate last. */
  async list(): Promise<AdRateDto[]> {
    const overrides = await this.overrides.get();
    return [...AD_RATE_KEYS.map((key) => this.toDto(key, overrides.get(key))), this.toDto(USD_RATE_KEY, overrides.get(USD_RATE_KEY))];
  }

  /** Current price for an ad rate key, in kobo. */
  async rateKobo(key: AdRateKey): Promise<number> {
    return (await this.overrides.get()).get(key)?.priceKobo ?? AD_RATE_DEFINITIONS[key].defaultKobo;
  }

  async pricing(): Promise<AdPricing> {
    const overrides = await this.overrides.get();
    const rate = (key: AdRateKey): number => overrides.get(key)?.priceKobo ?? AD_RATE_DEFINITIONS[key].defaultKobo;
    const weekPriceKobo = (slot: Pick<AdSlot, 'id' | 'kind' | 'districtId'>): number => adWeekPriceKobo(slot, rate(adRateKeyOf(slot)));
    return {
      weekPriceKobo,
      block: (slot) => blockPriceOf(weekPriceKobo(slot)),
      songPriceKobo: rate('club-song'),
    };
  }

  /**
   * Set a rate (whole naira, ₦2,000 – ₦100m; the exchange rate ₦500 – ₦5,000 per $1). Applies to new quotes and
   * checkouts on every node within a second; existing orders and payments keep theirs. Knows nothing about who may
   * call it: the admin route checks roles and writes the audit log.
   */
  async setRate(key: string, priceKobo: number, actorUserId: string | null, reason?: string, inTransaction?: AdRateHook): Promise<AdRateDto> {
    const rateKey = this.requireKey(key);
    if (!isValidRateKobo(rateKey, priceKobo)) {
      const [min, max] = rateKey === USD_RATE_KEY ? [RATE_CARD_MIN_KOBO, USD_RATE_MAX_KOBO] : [AD_MIN_PRICE_KOBO, AD_MAX_PRICE_KOBO];
      const unit = rateKey === USD_RATE_KEY ? ' per $1' : '';
      throw new PromotionRuleException('INVALID_RATE', `Rates are whole naira from ${formatNaira(koboToNaira(min))} to ${formatNaira(koboToNaira(max))}${unit}`);
    }
    const dto = await this.rates.manager.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(AdRateEntity, { key: rateKey, priceKobo, updatedBy: actorUserId, reason: reason?.trim().slice(0, REASON_MAX) || null }),
      );
      const result = this.toDto(rateKey, saved);
      await inTransaction?.(manager, result);
      return result;
    });
    this.logger.log({ key: rateKey, priceKobo, actorUserId }, 'Ad rate changed');
    await this.broadcast();
    return dto;
  }

  /** Drop the override: the catalog default applies again. */
  async resetRate(key: string, inTransaction?: AdRateHook): Promise<AdRateDto> {
    const rateKey = this.requireKey(key);
    const dto = await this.rates.manager.transaction(async (manager) => {
      await manager.delete(AdRateEntity, { key: rateKey });
      const result = this.toDto(rateKey, undefined);
      await inTransaction?.(manager, result);
      return result;
    });
    this.logger.log({ key: rateKey }, 'Ad rate reset to the default');
    await this.broadcast();
    return dto;
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private requireKey(key: string): RateCardKey {
    if (!isRateCardKey(key)) throw new ResourceNotFoundException('Ad rate');
    return key;
  }

  private async load(): Promise<Overrides> {
    const rows = await this.rates.find();
    return new Map(rows.filter((row) => isRateCardKey(row.key) && isValidRateKobo(row.key, row.priceKobo)).map((row) => [row.key, row]));
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
    this.usdRate.invalidate();
    for (const listener of this.listeners) listener();
  }

  private toDto(key: RateCardKey, override: AdRateEntity | undefined): AdRateDto {
    if (key === USD_RATE_KEY) {
      const currentKobo = override?.priceKobo ?? USD_RATE_DEFINITION.defaultKobo;
      return {
        key,
        label: USD_RATE_DEFINITION.label,
        unit: USD_RATE_DEFINITION.unit,
        byDistrict: false,
        defaultKobo: USD_RATE_DEFINITION.defaultKobo,
        currentKobo,
        blockDays: 0,
        blockPriceKobo: null,
        summary: `${formatNaira(koboToNaira(currentKobo))} per $1 · converts naira prices to dollar prices and dollar top-ups to naira`,
        updatedAt: override?.updatedAt?.toISOString() ?? null,
        updatedBy: override?.updatedBy ?? null,
      };
    }
    const definition = AD_RATE_DEFINITIONS[key];
    const currentKobo = override?.priceKobo ?? definition.defaultKobo;
    // Club songs are always sold by the week; ads by the block their (base) weekly rate implies.
    const blockDays = key === 'club-song' ? AD_WEEK_DAYS : adBlockDays(currentKobo);
    const summary = adRateSummary(currentKobo, blockDays);
    return {
      key,
      label: definition.label,
      unit: definition.unit,
      byDistrict: definition.byDistrict,
      defaultKobo: definition.defaultKobo,
      currentKobo,
      blockDays,
      blockPriceKobo: definition.byDistrict ? null : adBlockPriceKobo(currentKobo, blockDays),
      summary: definition.byDistrict ? `${summary} (base rate; each district scales it)` : summary,
      updatedAt: override?.updatedAt?.toISOString() ?? null,
      updatedBy: override?.updatedBy ?? null,
    };
  }
}
