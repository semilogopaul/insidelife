'use client';

import { useEffect } from 'react';
import { errorMessage } from '@/common/api/api-error';
import { Sheet, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useChooseLifeEvent, usePendingLifeEvents } from '../hooks/use-life-events';
import { useLifeEventsUi } from '../hooks/use-life-events-ui';
import { EventCard } from './EventCard';
import { OutcomeReveal } from './OutcomeReveal';

/**
 * Life happens: one card per pending event with choices. Opens automatically when something new arrives; "Decide
 * later" hides it (the HUD chip brings it back). Unanswered cards resolve to a default when they expire, so ignoring
 * them is a choice too. After choosing, the outcome is revealed in the same card.
 */
export function LifeEventsLayer() {
  const { events } = usePendingLifeEvents();
  const open = useLifeEventsUi((state) => state.open);
  const setOpen = useLifeEventsUi((state) => state.setOpen);
  const announce = useLifeEventsUi((state) => state.announce);
  const reveal = useLifeEventsUi((state) => state.reveal);
  const showOutcome = useLifeEventsUi((state) => state.showOutcome);
  const clearOutcome = useLifeEventsUi((state) => state.clearOutcome);
  const choose = useChooseLifeEvent();

  useEffect(() => {
    const { announced } = useLifeEventsUi.getState();
    const fresh = events.filter((event) => !announced.has(event.id));
    if (fresh.length === 0) return;
    announce(fresh.map((event) => event.id));
    gameEvents.emit('sfx', { id: 'notification' });
  }, [events, announce]);

  const remaining = events.filter((event) => event.id !== reveal?.eventId);
  const current = remaining[0] ?? null;
  const visible = reveal !== null || (open && current !== null);

  const finishReveal = (): void => {
    clearOutcome();
    if (remaining.length === 0) setOpen(false);
  };

  const onChoose = (eventId: string, title: string, choiceId: string): void => {
    gameEvents.emit('sfx', { id: 'ui-click' });
    choose.mutate(
      { id: eventId, choiceId },
      {
        onSuccess: (outcome) => {
          showOutcome(eventId, title, outcome);
          gameEvents.emit('sfx', {
            id: outcome.moneyDelta > 0 ? 'cash-in' : outcome.tone === 'good' ? 'ui-success' : outcome.tone === 'bad' ? 'ui-error' : 'ui-click',
          });
        },
        onError: (error) => {
          gameEvents.emit('sfx', { id: 'ui-error' });
          toast({ title: 'That didn’t work', body: errorMessage(error), tone: 'bad' });
        },
      },
    );
  };

  return (
    <Sheet
      open={visible}
      onClose={reveal ? finishReveal : () => setOpen(false)}
      tone="ink"
      size="sm"
      title={reveal ? reveal.title : (current?.title ?? '')}
      description={reveal ? 'Here’s how it went.' : remaining.length > 1 ? `${remaining.length} decisions waiting` : undefined}
    >
      {reveal ? (
        <OutcomeReveal outcome={reveal.outcome} moreWaiting={remaining.length} onContinue={finishReveal} />
      ) : (
        current && (
          <EventCard
            key={current.id}
            event={current}
            pendingChoiceId={choose.isPending ? (choose.variables?.choiceId ?? null) : null}
            onChoose={(choiceId) => onChoose(current.id, current.title, choiceId)}
            onLater={() => setOpen(false)}
          />
        )
      )}
    </Sheet>
  );
}
