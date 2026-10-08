import { Injectable } from '@nestjs/common';
import type { NotificationDraft } from '../notifications/notifications.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';

export type OtherPlayerNotification = Omit<NotificationDraft, 'gameMinute'>;

/**
 * Notifies *another* player from inside the acting player's session: the notification row is written in the
 * actor's transaction (so it exists only if the action commits) and pushed to the recipient's sockets after commit,
 * followed by `character:invalidate` so their client refetches (balance, friend list…).
 */
@Injectable()
export class SocialNotifier {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly bus: RealtimeBus,
  ) {}

  async notify(ctx: SimulationContext, recipientId: string, draft: OtherPlayerNotification, reason: string): Promise<void> {
    if (recipientId === ctx.character.id) {
      ctx.notify(draft);
      return;
    }
    const created = await this.notifications.create(ctx.manager, recipientId, [{ ...draft, gameMinute: ctx.time }]);
    ctx.afterCommit(() => {
      this.notifications.push(recipientId, created);
      this.bus.toCharacter(recipientId, 'character:invalidate', { reason });
    });
  }

  /** Tell a recipient to refetch without a notification row. */
  invalidate(ctx: SimulationContext, recipientId: string, reason: string): void {
    ctx.afterCommit(() => this.bus.toCharacter(recipientId, 'character:invalidate', { reason }));
  }
}
