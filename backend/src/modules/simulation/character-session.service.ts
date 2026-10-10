import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import type { NotificationDto } from '@insidelife/shared';
import { NoCharacterException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { withTransaction } from '../../database/transaction.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { WorldService } from '../world/world.service.js';
import { CharacterWallet, SimulationContext } from './simulation-context.js';
import { hookProfiler } from './hook-profiler.js';
import { SimulationEngine } from './simulation-engine.service.js';

export type CharacterRef = { readonly userId: string } | { readonly characterId: string };

export interface SessionOptions {
  /** Skip the lock if another request holds it (background settler) instead of waiting. */
  readonly skipLocked?: boolean;
  /** Settle up to now before running the command (default true). */
  readonly settle?: boolean;
  /** Mark the player as active (resets idle timers, used for the settle queue). */
  readonly touch?: boolean;
}

/** Thrown internally when `skipLocked` finds the row busy. */
class CharacterBusy extends Error {}

/**
 * The single entry point for anything that reads-then-writes a character. One call =
 * 1. a transaction (retried on deadlock),
 * 2. the character row locked `FOR UPDATE` plus its wallet,
 * 3. the simulation settled to now,
 * 4. the command,
 * 5. persistence of the character and queued notifications,
 * 6. post-commit effects (socket pushes, presence).
 *
 * Because every mutation serialises on the character row, double-submits and racing tabs can't double-spend or
 * double-claim anything.
 */
@Injectable()
export class CharacterSession {
  private readonly logger = new Logger(CharacterSession.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly world: WorldService,
    private readonly engine: SimulationEngine,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly bus: RealtimeBus,
    private readonly metrics: MetricsService,
    private readonly presence: PresenceService,
  ) {}

  async run<T>(ref: CharacterRef, command: (ctx: SimulationContext) => Promise<T>, options: SessionOptions = {}): Promise<T> {
    const pushes: { characterId: string; notifications: NotificationDto[] } = { characterId: '', notifications: [] };
    let hooks: SimulationContext['pendingAfterCommit'] = [];
    let changed: CharacterEntity | null = null;

    const result = await withTransaction(this.dataSource, async (manager) => {
      const character = await this.lock(manager, ref, options.skipLocked ?? false);
      const startedAt = character.locationId;
      const startedLook = JSON.stringify(character.outfit);
      const now = this.world.now();
      const ctx = new SimulationContext(character, manager, this.world, now);
      const balances = await this.ledger.balances(manager, character.id, true);
      ctx.bindWallet(new CharacterWallet(ctx, this.ledger, await this.ledger.characterAccounts(manager, character.id), balances.cash));

      if (options.settle ?? true) {
        const stop = this.metrics.settleDuration.startTimer();
        const fromDay = character.settledAt;
        const started = performance.now();
        await this.engine.settle(ctx, now);
        stop();
        const days = Math.max(0, now - fromDay) / 1440;
        this.metrics.settledGameDays.observe(days);
        hookProfiler.flush(`settle ${days.toFixed(1)} game days`, performance.now() - started);
      }
      ctx.time = Math.max(ctx.time, now);
      // Money owed from a refunded top-up comes out of whatever just arrived (gifts, transfers) before anything else.
      await ctx.wallet.collectDebt();

      const value = await command(ctx);
      await ctx.wallet.flush();

      if (options.touch) character.lastActiveAt = new Date();
      await manager.save(character);
      pushes.characterId = character.id;
      pushes.notifications = await this.notifications.create(manager, character.id, ctx.notifications);
      hooks = ctx.pendingAfterCommit;
      // Other players see you through presence: re-broadcast when you go somewhere or change clothes.
      changed = character.locationId !== startedAt || JSON.stringify(character.outfit) !== startedLook ? character : null;
      return value;
    });

    if (changed) await this.refreshPresence(changed);

    if (pushes.notifications.length > 0) {
      this.notifications.push(pushes.characterId, pushes.notifications);
      this.bus.toCharacter(pushes.characterId, 'character:invalidate', { reason: 'notifications' });
    }
    for (const hook of hooks) {
      try {
        await hook();
      } catch (error) {
        this.logger.warn({ err: error }, 'After-commit hook failed');
      }
    }
    return result;
  }

  /** Keep "who's here" honest: online players' presence follows their committed location and outfit. */
  private async refreshPresence(character: CharacterEntity): Promise<void> {
    try {
      const current = await this.presence.get(character.id);
      if (!current) return;
      const updated = {
        ...current,
        locationId: character.locationId,
        activity: character.activity?.actionId ?? null,
        status: character.status,
        outfit: character.outfit,
      };
      await this.presence.markOnline(updated);
      this.bus.broadcast('presence:updated', updated);
    } catch (error) {
      this.logger.debug({ err: error }, 'Presence refresh skipped');
    }
  }

  /** Settle a character if nobody else is holding it; returns false when skipped. */
  async settleInBackground(characterId: string): Promise<boolean> {
    try {
      await this.run({ characterId }, async () => undefined, { skipLocked: true });
      return true;
    } catch (error) {
      if (error instanceof CharacterBusy) return false;
      throw error;
    }
  }

  private async lock(manager: EntityManager, ref: CharacterRef, skipLocked: boolean): Promise<CharacterEntity> {
    const query = manager.getRepository(CharacterEntity).createQueryBuilder('character');
    if ('userId' in ref) query.where('character.user_id = :userId AND character.alive = true', { userId: ref.userId });
    else query.where('character.id = :characterId', { characterId: ref.characterId });
    query.setLock('pessimistic_write');
    if (skipLocked) query.setOnLocked('skip_locked');

    const character = await query.getOne();
    if (!character) {
      if (skipLocked) throw new CharacterBusy();
      if ('userId' in ref) throw new NoCharacterException();
      throw new ResourceNotFoundException('Character');
    }
    return character;
  }
}
