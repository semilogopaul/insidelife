'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { toast } from '@/common/components/toast-store';
import { gameEvents } from '@/common/game/game-events';
import { checkPayment, paymentsApi } from './payments.api';
import { deliveredAlert, isNewlyDelivered, paymentChanged, paymentsToRecover, pruneChecks, shouldScan } from './recovery';

/** Everything a landed payment can change: money, the HUD, the Bank (payments, statement) and Promote (ads, tracks). */
export async function invalidateAfterPayment(client: QueryClient): Promise<void> {
  await Promise.all(
    [queryKeys.wallet, queryKeys.snapshot, queryKeys.domain('bank'), queryKeys.domain('promote')].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}

interface RecoveryMemory {
  /** Reference → when this tab last checked it. */
  readonly lastCheckedAt: Map<string, number>;
  lastScanAt: number | null;
  running: boolean;
}

/**
 * Finds payments that landed while the player was away (Flutterwave couldn't send them back, they closed the tab, the
 * bank was slow) and delivers them at once. On mount, and whenever the game regains focus or becomes visible, it looks
 * at the account's recent unconfirmed payments (`paymentsToRecover`: up to 3, newest first, each at most every 30 s)
 * and asks the server to check each with Flutterwave. A delivered one gets a "Payment confirmed" alert and refreshes
 * money, the Bank and Promote. Failures stay quiet: the server keeps checking by itself. Mount once (GameRoot).
 */
export function usePaymentRecovery(): void {
  const client = useQueryClient();
  const authenticated = useSession((state) => state.status === 'authenticated');
  const memory = useRef<RecoveryMemory>({ lastCheckedAt: new Map(), lastScanAt: null, running: false });

  useEffect(() => {
    if (!authenticated) return;
    const scan = async (): Promise<void> => {
      const state = memory.current;
      if (state.running || !shouldScan(state.lastScanAt, Date.now())) return;
      state.running = true;
      state.lastScanAt = Date.now();
      try {
        pruneChecks(state.lastCheckedAt, Date.now());
        const due = paymentsToRecover(await paymentsApi.list(), Date.now(), state.lastCheckedAt);
        let changed = false;
        for (const payment of due) {
          state.lastCheckedAt.set(payment.reference, Date.now());
          // Rate limited, Flutterwave unreachable, offline: try again on the next focus.
          const result = await checkPayment(payment.reference).catch(() => null);
          if (!result) continue;
          changed ||= paymentChanged(payment, result.payment);
          if (isNewlyDelivered(payment, result)) {
            toast(deliveredAlert(result.payment));
            gameEvents.emit('sfx', { id: 'cash-in' });
          }
        }
        if (changed) await invalidateAfterPayment(client);
      } catch {
        // The list itself couldn't be read (offline, signed out): the next focus tries again.
      } finally {
        state.running = false;
      }
    };

    const onFocus = (): void => void scan();
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void scan();
    };
    void scan();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authenticated, client]);
}
