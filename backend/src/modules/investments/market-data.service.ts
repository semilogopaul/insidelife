import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import {
  BROKER_FEE_RATES,
  INSTRUMENTS,
  dayIndexOf,
  findInstrument,
  priceOn,
  type InstrumentDefinition,
  type MarketQuoteDto,
  type MarketsDto,
  type PriceHistoryDto,
} from '@insidelife/shared';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import { WorldService } from '../world/world.service.js';

/**
 * Deterministic market prices for every instance. Random walks use a **server-only market seed** — the world seed is
 * published to clients (`GET /world/clock`), and prices derived from it alone would let anyone compute tomorrow's
 * close. Seed source: `MARKET_SEED` env when set, otherwise HMAC(JWT secret, world seed) so every instance agrees
 * without new config (rotating the JWT secret would then reshuffle history — set MARKET_SEED in production).
 */
@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly marketSeed: string;

  constructor(
    private readonly world: WorldService,
    config: ConfigService,
  ) {
    const explicit = config.get<string>('MARKET_SEED')?.trim();
    if (explicit) {
      this.marketSeed = explicit;
    } else {
      const secret = config.getOrThrow<AppConfig['auth']>('auth').accessSecret;
      this.marketSeed = createHmac('sha256', secret).update(`insidelife:market:${world.seed}`).digest('hex').slice(0, 32);
      this.logger.log('MARKET_SEED not set; derived the market seed from server secrets');
    }
  }

  today(): number {
    return dayIndexOf(this.world.now());
  }

  instrument(id: string): InstrumentDefinition {
    const instrument = findInstrument(id);
    if (!instrument) throw new ResourceNotFoundException('Instrument');
    return instrument;
  }

  /** Naira per unit on a world day. */
  price(instrumentId: string, dayIndex: number): number {
    return priceOn(instrumentId, dayIndex, this.world.seed, this.marketSeed);
  }

  markets(dayIndex: number = this.today()): MarketsDto {
    return { dayIndex, instruments: INSTRUMENTS.map((instrument) => this.quote(instrument, dayIndex)) };
  }

  history(instrumentId: string, days: number, dayIndex: number = this.today()): PriceHistoryDto {
    const instrument = this.instrument(instrumentId);
    const first = Math.max(0, dayIndex - days + 1);
    const points = [];
    for (let day = first; day <= dayIndex; day++) points.push({ dayIndex: day, price: this.price(instrument.id, day) });
    return { instrumentId: instrument.id, points };
  }

  private quote(instrument: InstrumentDefinition, dayIndex: number): MarketQuoteDto {
    const price = this.price(instrument.id, dayIndex);
    const change = (days: number): number => {
      const before = this.price(instrument.id, Math.max(0, dayIndex - days));
      return before > 0 ? Math.round((price / before - 1) * 10_000) / 10_000 : 0;
    };
    return {
      instrumentId: instrument.id,
      name: instrument.name,
      kind: instrument.kind,
      sector: instrument.sector,
      blurb: instrument.blurb,
      risk: instrument.risk,
      price,
      change1d: change(1),
      change30d: change(30),
      dividendYield: instrument.dividendYield,
      feeRate: BROKER_FEE_RATES[instrument.kind],
    };
  }
}
