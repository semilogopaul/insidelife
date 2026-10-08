import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameEvents, type SfxId } from '@/common/game/game-events';

export interface AnnounceOptions {
  readonly body?: string;
  readonly amount?: number;
  readonly sfx?: SfxId;
  readonly tone?: 'good' | 'bad' | 'neutral';
  /**
   * The server already pushes a notification for this command (it arrives as a toast over the realtime socket):
   * play the sound only, so the player doesn't see the same news twice.
   */
  readonly serverNotifies?: boolean;
}

/** Positive outcome: toast + sound (cash sounds when money moved). */
export function announce(title: string, options: AnnounceOptions = {}): void {
  const { body, amount, tone = 'good', serverNotifies = false } = options;
  const sfx =
    options.sfx ??
    (amount !== undefined && amount < 0
      ? 'cash-out'
      : amount !== undefined && amount > 0
        ? 'cash-in'
        : 'ui-success');
  gameEvents.emit('sfx', { id: tone === 'bad' ? 'ui-error' : sfx });
  if (!serverNotifies) toast({ title, body, amount, tone });
}

/** Failed command: the server's player-friendly reason (it says how to fix it). */
export function complain(title: string, error: unknown): void {
  gameEvents.emit('sfx', { id: 'ui-error' });
  toast({ title, body: errorMessage(error), tone: 'bad' });
}
