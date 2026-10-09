'use client';

import { useState } from 'react';
import { findHostTreat, type HostTreatId } from '@insidelife/shared';
import { ErrorState, LoadingRows, Sheet, toast } from '@/common/components';
import { complain } from '@/common/game/feedback';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { useHosting, useServeTreat } from '../hooks/use-hosting';
import { HostMenu } from './HostMenu';

/** The host's sheet while guests are in: serve food, drinks, cake or something for the road. */
export function HostSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const query = useHosting(open);
  const serve = useServeTreat();
  const cash = useSnapshot().data?.wallet.balance ?? 0;
  const [serving, setServing] = useState<HostTreatId | null>(null);

  const onServe = (treatId: HostTreatId): void => {
    setServing(treatId);
    serve.mutate(
      { treatId, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: (result) => {
          const def = findHostTreat(result.treatId);
          gameEvents.emit('sfx', { id: 'ui-success' });
          toast({
            title: `${def?.emoji ?? '🍽️'} ${def?.name ?? 'Treat'} is on the table`,
            body:
              result.cloutGained > 0
                ? `Generous host — +${result.cloutGained} clout.`
                : `${result.guests === 1 ? 'Your guest' : 'Your guests'} will feel it.`,
            tone: 'good',
            amount: result.total > 0 ? -result.total : undefined,
          });
        },
        onError: (error) => complain('Couldn’t serve that', error),
        onSettled: () => setServing(null),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Host your guests"
      description="Treat everyone inside. You pay; they feel it."
      size="md"
    >
      {query.isPending ? (
        <LoadingRows rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <HostMenu hosting={query.data} cash={cash} serving={serving} onServe={onServe} />
      )}
    </Sheet>
  );
}
