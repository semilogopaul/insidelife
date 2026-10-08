import { Injectable } from '@nestjs/common';
import { NotificationsService, type NotificationDraft } from '../../notifications/notifications.service.js';
import { RealtimeBus } from '../../realtime-bus/realtime-bus.service.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';

/**
 * Tells another player something happened between you (proposal, wedding, break-up). The notification row is written
 * in this transaction; the push and a `character:invalidate` go out after commit. Their own state changes happen in
 * their own session (see `PlayerLinksService.reconcile`).
 */
@Injectable()
export class PlayerNotifier {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly bus: RealtimeBus,
  ) {}

  async notify(ctx: SimulationContext, characterId: string, draft: Omit<NotificationDraft, 'gameMinute'>, reason = 'relationships'): Promise<void> {
    const created = await this.notifications.create(ctx.manager, characterId, [{ ...draft, gameMinute: ctx.time }]);
    ctx.afterCommit(() => {
      this.notifications.push(characterId, created);
      this.bus.toCharacter(characterId, 'character:invalidate', { reason });
    });
  }

  /** Ask a character's open clients to refetch (no notification). */
  invalidate(ctx: SimulationContext, characterId: string, reason: string): void {
    ctx.afterCommit(() => this.bus.toCharacter(characterId, 'character:invalidate', { reason }));
  }
}
