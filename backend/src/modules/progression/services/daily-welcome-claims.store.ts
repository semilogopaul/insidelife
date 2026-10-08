import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DailyWelcomeClaimEntity } from '../entities/daily-welcome-claim.entity.js';

export interface DailyWelcomeClaimDraft {
  readonly userId: string;
  readonly characterId: string;
  readonly realDate: string;
  readonly flavourId: string;
  readonly cash: number;
  readonly moodBoost: number;
  readonly gameMinute: number;
}

export interface DailyWelcomeClaimRecord {
  readonly flavourId: string;
  readonly cash: number;
}

/** Persistence for daily welcome claims; the unique (user, Lagos date) index is the once-per-day guarantee. */
@Injectable()
export class DailyWelcomeClaimStore {
  /** Insert the claim unless the account already claimed that Lagos day. Returns true when this call claimed it. */
  async tryInsert(manager: EntityManager, draft: DailyWelcomeClaimDraft): Promise<boolean> {
    const result = await manager.createQueryBuilder().insert().into(DailyWelcomeClaimEntity).values({ ...draft }).orIgnore().execute();
    return Array.isArray(result.raw) && result.raw.length > 0;
  }

  async find(manager: EntityManager, userId: string, realDate: string): Promise<DailyWelcomeClaimRecord | null> {
    return manager.findOne(DailyWelcomeClaimEntity, { where: { userId, realDate }, select: { id: true, flavourId: true, cash: true } });
  }
}
