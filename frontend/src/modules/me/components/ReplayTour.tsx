'use client';

import { Button } from '@/common/components';
import { useUi } from '@/common/game/ui-store';

/** Starts the guided walkthrough again (the phone closes; the walkthrough feature reacts to the request). */
export function ReplayTour() {
  const requestTour = useUi((state) => state.requestTour);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-soft">A short tour of moving around, goals, the clean screen, buying a car or house, and Promote.</p>
      <Button variant="paper" onClick={requestTour}>
        Replay the walkthrough
      </Button>
    </div>
  );
}
