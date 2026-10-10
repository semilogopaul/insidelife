import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { WorldService } from '../world/world.service.js';
import { SETTLEMENT_QUEUE } from './settlement.constants.js';

/** Settle characters whose simulation lags more than this many game minutes (≈ 2 real minutes). */
const STALE_AFTER_GAME_MINUTES = 120;
const BATCH_SIZE = 200;

/**
 * Keeps offline characters' worlds turning: salaries land, rent is due, events fire and leaderboards stay honest
 * even for players who haven't opened the game today. Uses SKIP LOCKED so it never fights live requests.
 */
@Processor(SETTLEMENT_QUEUE, { concurrency: 2 })
export class SettlementProcessor extends WorkerHost {
  private readonly logger = new Logger(SettlementProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly session: CharacterSession,
    private readonly world: WorldService,
  ) {
    super();
  }

  async process(): Promise<{ settled: number; skipped: number }> {
    const threshold = this.world.now() - STALE_AFTER_GAME_MINUTES;
    const stale = await this.dataSource
      .getRepository(CharacterEntity)
      .createQueryBuilder('character')
      .select(['character.id'])
      .where('character.alive = true AND character.settled_at < :threshold', { threshold })
      .orderBy('character.settled_at', 'ASC')
      .limit(BATCH_SIZE)
      .getMany();

    let settled = 0;
    let skipped = 0;
    for (const { id } of stale) {
      try {
        if (await this.session.settleInBackground(id)) settled++;
        else skipped++;
      } catch (error) {
        skipped++;
        this.logger.warn({ err: error, characterId: id }, 'Background settle failed');
      }
    }
    if (settled > 0) this.logger.log(`Settled ${settled} characters (${skipped} skipped)`);
    return { settled, skipped };
  }
}
